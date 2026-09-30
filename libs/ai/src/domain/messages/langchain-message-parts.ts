import type { ChatMessagePart } from './message-part.schema';

/**
 * A tool call as LangChain serializes it onto an `AIMessage`, with the matching
 * `ToolMessage`'s result already folded in (`output` + `state`).
 *
 * The fold happens in SQL (`chat_message_view`), not here, because
 * `Chat.chatMessages` is a cursor connection: a call and its result are two rows
 * in the checkpointer, and a page boundary between them would render a tool call
 * that never came back.
 */
export interface LcToolCall {
  id?: string;
  name?: string;
  args?: unknown;
  /** The `ToolMessage`'s content; absent when the run never produced one. */
  output?: unknown;
  /**
   * - `output-available` — the tool returned (`ToolMessage.status = 'success'`)
   * - `output-error`     — the tool failed (`ToolMessage.status = 'error'`)
   * - `input-available`  — no `ToolMessage`: the run died before the tool
   *   returned. NOT "still running" — nothing is running any more.
   */
  state?: 'input-available' | 'output-available' | 'output-error';
}

/**
 * An attachment the file-ingestion middleware ingested for this message.
 *
 * Lifted by the view out of `additional_kwargs`, where the middleware stashes
 * it. The transcript needs the FILE (the user sent it); it does not need the
 * marker / analysis that sit next to it there, which are prompt material.
 */
export interface LcAttachment {
  path?: string;
  fileName?: string;
  mimeType?: string;
  url?: string;
}

/**
 * What `chat_message_view.parts` carries: the raw LangChain payload of one
 * message. `ChatMessagePartsType` feeds it to `toParts` on hydration, so the
 * entity that comes out of `em.find` already has `ChatMessagePart[]`.
 */
export interface LcMessageSource {
  /** Either a plain string or an array of multimodal content blocks. */
  content?: unknown;
  toolCalls?: LcToolCall[];
  attachments?: LcAttachment[];
}

/** A single block of LangChain's multimodal `content` array. */
interface LcContentBlock {
  type?: string;
  text?: string;
  image_url?: { url?: string } | string;
}

/**
 * LangChain `content` is either a plain string or an array of blocks. Returns
 * the concatenated text, or `null` when there is none.
 */
export function readText(content: unknown): string | null {
  if (typeof content === 'string') return content.length > 0 ? content : null;
  if (!Array.isArray(content)) return null;

  const text = (content as LcContentBlock[])
    .filter((block) => typeof block?.text === 'string')
    .map((block) => block.text as string)
    .join('');

  return text.length > 0 ? text : null;
}

/** Inline `image_url` blocks — the only file-ish thing LangChain keeps on a message. */
function readImageParts(content: unknown): ChatMessagePart[] {
  if (!Array.isArray(content)) return [];

  const parts: ChatMessagePart[] = [];
  for (const block of content as LcContentBlock[]) {
    if (block?.type !== 'image_url') continue;
    const url =
      typeof block.image_url === 'string'
        ? block.image_url
        : (block.image_url?.url ?? '');
    if (!url) continue;
    // `data:<mediaType>;base64,…` — recover the media type when it's a data URL.
    const mediaType = /^data:([^;,]+)/.exec(url)?.[1] ?? 'image/*';
    parts.push({ type: 'file', url, mediaType });
  }
  return parts;
}

/**
 * A `ToolMessage`'s content is a string, and tools almost always return JSON in
 * it. Parse when we can; otherwise the raw text is the output.
 */
function parseToolOutput(output: unknown): unknown {
  if (typeof output !== 'string') return output ?? null;
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

/**
 * The stub the A2A middleware routes every CLIENT tool through.
 *
 * A remote agent advertises its tools at run time, so they cannot be registered
 * on the graph ahead of time — and LangChain's `ToolNode` dispatches on the tool
 * call's `name`, which therefore has to be a name the graph actually knows. The
 * middleware rewrites `foo(args)` into `intercept_client_call({id, name, args})`
 * so a single registered stub can `interrupt()` and hand the call to the browser.
 */
const CLIENT_CALL_INTERCEPTOR = 'intercept_client_call';

/** The real call, as the interceptor's `args` carry it. */
interface InterceptedClientCall {
  id?: string;
  name?: string;
  args?: unknown;
}

/**
 * Recover the real tool from an intercepted client call.
 *
 * The interceptor is a routing detail of the graph, not something a user ever
 * asked for: persisted verbatim it renders as a nameless `intercept_client_call`
 * whose `args` are an envelope rather than the tool's own input — which is why
 * these calls came back blank in the UI. Unwrapping here rather than rewriting
 * the checkpoint keeps the graph's own record honest (the stub really is what
 * ran), fixes conversations that were already persisted, and covers every
 * client at once, since they all read this mapper's output.
 *
 * The outer `id` is deliberately kept: `chat_message_view` already folded the
 * `ToolMessage` onto this call by that id, so replacing it would orphan the
 * result. An envelope with no usable `name` is left alone — showing the stub is
 * better than showing a call with no name at all.
 */
function unwrapInterceptedCall(toolCall: LcToolCall): LcToolCall {
  if (toolCall.name !== CLIENT_CALL_INTERCEPTOR) return toolCall;

  const envelope = toolCall.args as InterceptedClientCall | undefined;
  const name = typeof envelope?.name === 'string' ? envelope.name : undefined;
  if (!name) return toolCall;

  return { ...toolCall, name, args: envelope?.args ?? {} };
}

function toToolInvocationPart(toolCall: LcToolCall): ChatMessagePart {
  const call = unwrapInterceptedCall(toolCall);

  return {
    type: 'tool-invocation',
    toolCallId: call.id ?? null,
    toolName: call.name ?? null,
    input: call.args ?? null,
    // A call with no result never came back — the run was cut short (cancelled,
    // crashed, or interrupted awaiting approval). The view says which.
    state: call.state ?? 'input-available',
    output: parseToolOutput(call.output),
  };
}

/**
 * Shapes one LangChain message into the AI-SDK part model the clients render.
 * Purely per-message: the call/result join already happened in SQL, so this
 * stays correct under cursor pagination.
 */
export function toParts(source: LcMessageSource): ChatMessagePart[] {
  if (!source) return [];
  // Defensive: some paths hand back an already-shaped array.
  if (Array.isArray(source)) return source as ChatMessagePart[];

  const parts: ChatMessagePart[] = [];

  for (const toolCall of source.toolCalls ?? []) {
    parts.push(toToolInvocationPart(toolCall));
  }

  const text = readText(source.content);
  if (text !== null) parts.push({ type: 'text', text });

  const attachments = readAttachmentParts(source.attachments);
  if (attachments.length) {
    // The ingested attachments ARE the inline images, re-encoded: an agent
    // configured with `inlineImageDataUri` keeps a `data:` copy in `content`
    // for the model's benefit. Rendering both would double every image in the
    // UI, and the hosted URL is the better of the two — it costs bytes instead
    // of megabytes over the wire and survives a reload.
    parts.push(...attachments);
  } else {
    parts.push(...readImageParts(source.content));
  }

  return parts;
}

/**
 * One `file` part per ingested attachment.
 *
 * Skips any attachment whose bytes never landed (no `url`): the marker already
 * told the agent to ask for a resend, and a `file` part with no URL renders as
 * a broken image, which reads to the user as "the system lost my file" rather
 * than "the upload failed".
 */
function readAttachmentParts(
  attachments: LcAttachment[] | undefined,
): ChatMessagePart[] {
  if (!Array.isArray(attachments)) return [];

  const parts: ChatMessagePart[] = [];
  for (const attachment of attachments) {
    if (!attachment?.url) continue;
    parts.push({
      type: 'file',
      url: attachment.url,
      mediaType: attachment.mimeType ?? 'application/octet-stream',
      ...(attachment.fileName ? { filename: attachment.fileName } : {}),
    });
  }
  return parts;
}
