import { registry } from '@langchain/langgraph/zod';
import { z } from 'zod';

import {
  type DeliverySegment,
  deliverySegmentSchema,
} from './delivery-segment.schema';

/**
 * State channels shared between any supervisor that wants WhatsApp-style
 * delivery and the {@link HumanizedResponseAgent} subagent.
 *
 * ## Why every field uses `.default().register()`
 *
 * In zod v4 + `@langchain/langgraph/zod`, fields declared as bare
 * `z.X.optional()` map to `LastValue` channels in
 * `node_modules/langchain/dist/agents/annotation.js#createAgentState`
 * (raw fieldSchema, no `meta.reducer`). Those channels have no default
 * factory; `LastValue.fromCheckpoint(undefined)` returns an empty channel.
 * The practical effect on `RedisSaver`: the value evaporates on round-trip
 * between turns, so an audio-preference accepted on turn N is gone on
 * turn N+1 and the bot re-asks consent forever.
 *
 * Fields registered with `.default(...).register(registry, {reducer, default})`
 * become `ReducedValue` channels that DO survive serialization. We use:
 *
 *  - **`outboundSegments`**: concat reducer — per-turn batch where multiple
 *    `send_text`/`send_audio` calls accumulate. Supervisor resets with
 *    `new Overwrite([])` in `beforeAgent` to bypass the concat.
 *  - **`audioPref`**: merge reducer (CRITICAL — not last-write-wins).
 *    Subagents that don't declare `audioPref` in their own schema return
 *    `update=undefined` for this channel; last-write-wins would clobber
 *    the prior decision. Merge preserves it.
 *  - **string scalars** (`lastUserQuestion`, `lastToolData`, …): guarded
 *    last-write-wins — ignore `undefined` writes so subagent round-trips
 *    don't wipe the channel. Default `''` so the truthy checks the
 *    existing code does (`if (state.lastToolData) {...}`) behave
 *    identically to the old `undefined`-default behavior.
 *  - **`lastToolDataMessageIndex`**: tracks the messages-array index of
 *    the AIMessage whose tool_call produced the snapshot in `lastToolData`,
 *    so `stripRedundantSubagentTaskCalls` can decide if the data is fresh
 *    (no new HumanMessage since the snapshot) or stale (user has spoken
 *    since — legal re-delegation allowed).
 *
 * Fields are NOT in deepagents' `EXCLUDED_STATE_KEYS`
 * (`messages, todos, structuredResponse, skillsMetadata, memoryContents`),
 * so `filterStateForSubagent` preserves them when supervisor delegates
 * AND when a subagent returns.
 *
 * Why zod and not Annotation: `createMiddleware` from langchain requires
 * an InteropZodObject — Annotation roots are rejected with
 * "Schema must be an instance of z3.ZodObject or z4.$ZodObject".
 */

/**
 * Tri-state audio preference. Modeled as two orthogonal booleans because
 * "may I send audios?" (consent gate) and "do you want audios as the
 * default mode?" (delivery bias) are independent choices.
 *
 * - `allowed`: undefined → never asked; true → consent given (skip the
 *   audio-consent interrupt); false → user explicitly rejected (text-only).
 * - `preferred`: only meaningful when `allowed === true`. When true, the
 *   humanized response agent biases EVERY reply toward `send_audio` and
 *   reserves `send_text` for copyable content (CNJs, links, emails,
 *   document templates). When false (or undefined), the agent uses its
 *   normal text/audio split (long narrative → audio, short → text).
 * - `pending`: set just before `send_audio` raises the consent interrupt
 *   so the resume re-entry takes the classification branch instead of
 *   re-interrupting.
 */
type AudioPref = {
  allowed?: boolean;
  preferred?: boolean;
  pending?: boolean;
  /** @deprecated — legacy boolean. Migration path: `audio` → `{allowed, preferred}`. Kept as optional so older persisted state and tests don't choke. */
  audio?: boolean;
};

const guardedLastValueString = (
  current: string | undefined,
  update: string | undefined,
): string => (update === undefined ? current ?? '' : update);

const guardedLastValueNumber = (
  current: number | undefined,
  update: number | undefined,
): number => (update === undefined ? current ?? 0 : update);

export const humanizedResponseStateSchema = z.object({
  /**
   * Per-turn batch of segments produced by the response agent. The
   * `ChannelResponseProcessor.stream()` drain reads each new
   * `outboundSegments` slice off the agent's stream updates. Cleared at
   * the start of every turn by the supervisor's
   * `deliverableStateMiddleware.beforeAgent` using `new Overwrite([])`.
   */
  outboundSegments: z
    .array(deliverySegmentSchema)
    .default(() => [])
    .register(registry, {
      reducer: {
        schema: z.union([
          z.array(deliverySegmentSchema),
          deliverySegmentSchema,
        ]),
        fn: (
          current: DeliverySegment[],
          update: DeliverySegment | DeliverySegment[],
        ) => {
          const base = Array.isArray(current) ? current : [];
          if (update === undefined || update === null) return base;
          const incoming = Array.isArray(update) ? update : [update];
          return [...base, ...incoming];
        },
      },
      default: () => [] as DeliverySegment[],
    }),

  /**
   * Audio delivery preference. See the {@link AudioPref} doc comment for
   * the semantics of `allowed` / `preferred` / `pending`.
   *
   * Merge reducer — see file header for why this can't be last-write-wins.
   */
  audioPref: z
    .object({
      allowed: z.boolean().optional(),
      preferred: z.boolean().optional(),
      pending: z.boolean().optional(),
      // Legacy: older persisted entries may still carry this flag.
      audio: z.boolean().optional(),
    })
    .default(() => ({}))
    .register(registry, {
      reducer: {
        fn: (current: AudioPref | undefined, update: AudioPref | undefined) => {
          if (update === undefined) return current ?? {};
          return { ...(current ?? {}), ...update };
        },
      },
      default: () => ({}) as AudioPref,
    }),

  /**
   * Snapshot of the user's latest substantive question, captured by the
   * supervisor's `beforeAgent`. The humanized subagent reads this from
   * state because `filterStateForSubagent` strips `messages` from the
   * subagent's input.
   */
  lastUserQuestion: z
    .string()
    .default(() => '')
    .register(registry, {
      reducer: { fn: guardedLastValueString },
      default: () => '',
    }),

  /**
   * Snapshot of the most recent substantive tool result (e.g. the legal
   * subagent's case report). The humanized subagent reads this from state
   * because `state.messages` in the subagent is just the task description.
   */
  lastToolData: z
    .string()
    .default(() => '')
    .register(registry, {
      reducer: { fn: guardedLastValueString },
      default: () => '',
    }),

  /**
   * Index in `messages[]` of the AI message whose tool_call produced
   * `lastToolData`. Used by `stripRedundantSubagentTaskCalls` to decide
   * if the snapshot is "fresh" (no HumanMessage after this index — strip
   * legal re-delegation) or "stale" (user has asked something new since
   * — allow legal re-delegation).
   */
  lastToolDataMessageIndex: z
    .number()
    .default(() => 0)
    .register(registry, {
      reducer: { fn: guardedLastValueNumber },
      default: () => 0,
    }),

  /**
   * Display name used to address the user (e.g. WhatsApp `pushName`).
   */
  lastUserName: z
    .string()
    .default(() => '')
    .register(registry, {
      reducer: { fn: guardedLastValueString },
      default: () => '',
    }),

  /**
   * Short transcript snippet of the last few messages, useful when the
   * composer needs context that the task description doesn't carry.
   */
  recentHistory: z
    .string()
    .default(() => '')
    .register(registry, {
      reducer: { fn: guardedLastValueString },
      default: () => '',
    }),

  /**
   * Per-turn list of inbound source messages the user just sent (mirrors
   * `additional_kwargs.inbound.sources` produced by the message
   * assembler). Lets the humanized subagent pick a `quotedSourceId` for
   * `send_text` when a quoted-reply renders better than a plain bubble
   * (e.g. confirming a specific file the user uploaded).
   *
   * Overwrite per turn — supervisor's `beforeAgent` replaces this with the
   * current turn's sources, so stale ids from previous turns can't leak.
   */
  inboundSources: z
    .array(
      z.object({
        id: z.string(),
        excerpt: z.string().optional(),
        mediaKind: z.enum(['audio', 'image', 'document']).optional(),
        type: z.string().optional(),
      }),
    )
    .default(() => [])
    .register(registry, {
      reducer: {
        fn: (
          current: InboundSource[] | undefined,
          update: InboundSource[] | undefined,
        ) => (update === undefined ? current ?? [] : update),
      },
      default: () => [] as InboundSource[],
    }),
});

type InboundSource = {
  id: string;
  excerpt?: string;
  mediaKind?: 'audio' | 'image' | 'document';
  type?: string;
};

export type HumanizedResponseState = z.infer<typeof humanizedResponseStateSchema>;

export type AudioConsentInterruptPayload = {
  kind: 'audio_consent';
  consentQuestion: string;
};

export function isAudioConsentInterrupt(
  value: unknown,
): value is AudioConsentInterruptPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'audio_consent' &&
    typeof (value as { consentQuestion?: unknown }).consentQuestion === 'string'
  );
}
