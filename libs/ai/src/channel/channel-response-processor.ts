import { AIMessage } from '@langchain/core/messages';
import { Inject, Logger } from '@nestjs/common';

import { isProactiveAudioRequest } from '../middleware/proactive-audio.util';
import { InterruptMessageHumanizer } from '../services/interrupt-message-humanizer.service';
import {
  chunkAudioText,
  splitTextIntoSegments,
  TEXT_SEGMENT_MAX_CHARS,
} from '../services/segmentation';
import { InterruptPayloads } from './interrupt-payloads';

export interface ChannelInboundSource {
  id: string;
  excerpt?: string;
}

export interface ChannelDeliveryOptions {
  threadId: string;
  userId: string;
  pushName?: string;
  inboundSources?: ChannelInboundSource[];
}

export interface ChannelReadReceiptKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface ChannelReplyOptions extends ChannelDeliveryOptions {
  quotedMessageId: string;
  quotedText?: string;
}

export interface ChannelPresenceOptions {
  threadId: string;
  durationMs?: number;
}

export interface AgentStreamOptions extends ChannelDeliveryOptions {
  stream: AsyncIterable<unknown>;
  getSnapshot: () => Promise<unknown>;
  inboundMessage?: unknown;
  lastUserQuestion?: string;
}

export abstract class ChannelResponseProcessor {
  protected readonly baseLogger = new Logger(ChannelResponseProcessor.name);

  constructor(
    @Inject(InterruptMessageHumanizer)
    protected readonly interruptHumanizer: InterruptMessageHumanizer,
  ) {}

  async process(
    response: AsyncIterable<unknown>,
    options?: ChannelDeliveryOptions,
  ): Promise<number> {
    const threadId = options?.threadId;
    if (!threadId) {
      this.baseLogger.warn('No threadId provided, skipping delivery');
      return 0;
    }

    const sourceExcerpts = new Map<string, string>();
    for (const src of options?.inboundSources ?? []) {
      sourceExcerpts.set(src.id, src.excerpt ?? '');
    }

    let segmentIndex = 0;
    for await (const message of response) {
      const content = this.extractContent(message);
      if (!content?.trim()) continue;

      segmentIndex++;
      const trimmed = content.trim();
      const rawQuotedId = this.extractQuotedSourceId(message);
      const quotedSourceId =
        rawQuotedId && sourceExcerpts.has(rawQuotedId)
          ? rawQuotedId
          : undefined;
      if (rawQuotedId && !quotedSourceId) {
        this.baseLogger.warn(
          `[segment ${segmentIndex}] dropping quotedSourceId="${rawQuotedId}" — not in this turn's inboundSources (${sourceExcerpts.size} available)`,
        );
      }

      if (trimmed.startsWith('<AUDIO>')) {
        const audioText = trimmed.replace(/^<AUDIO>\s*/, '').trim();
        if (audioText) {
          this.baseLogger.log(
            `[segment ${segmentIndex}] AUDIO to ${threadId} (${audioText.length} chars)`,
          );
          await this.deliverAudio(audioText, threadId);
        }
      } else if (quotedSourceId) {
        this.baseLogger.log(
          `[segment ${segmentIndex}] TEXT (quoted=${quotedSourceId}) to ${threadId}: ${trimmed.substring(0, 80)}...`,
        );
        await this.deliverQuotedText(
          trimmed,
          threadId,
          quotedSourceId,
          sourceExcerpts.get(quotedSourceId),
        );
      } else {
        this.baseLogger.log(
          `[segment ${segmentIndex}] TEXT to ${threadId}: ${trimmed.substring(0, 80)}...`,
        );
        await this.deliverText(trimmed, threadId);
      }
    }

    this.baseLogger.log(
      `Delivery complete for ${threadId}: ${segmentIndex} segment(s) sent`,
    );
    return segmentIndex;
  }

  async stream(opts: AgentStreamOptions): Promise<number> {
    const { threadId, userId, pushName: maybePushName } = opts;
    const pushName = maybePushName ?? '';

    const inboundSources =
      opts.inboundMessage !== undefined
        ? this.extractInboundSources(opts.inboundMessage)
        : (opts.inboundSources ?? []);

    const deliveryOptions: ChannelDeliveryOptions = {
      threadId,
      userId,
      ...(maybePushName ? { pushName: maybePushName } : {}),
      ...(inboundSources.length ? { inboundSources } : {}),
    };

    return this.process(this.streamDeliveries(opts, pushName), deliveryOptions);
  }

  async sendPlainText(text: string, threadId: string): Promise<void> {
    const trimmed = text?.trim();
    if (!trimmed) return;
    this.baseLogger.log(
      `[sendPlainText] direct delivery to ${threadId} (${trimmed.length} chars)`,
    );
    await this.deliverText(trimmed, threadId);
  }

  protected async deliverTextInParts(
    text: string,
    threadId: string,
  ): Promise<void> {
    const parts = chunkAudioText(text.trim(), TEXT_SEGMENT_MAX_CHARS);
    for (const part of parts) {
      await this.deliverText(part, threadId);
    }
  }

  protected async *streamDeliveries(
    opts: AgentStreamOptions,
    pushName: string,
  ): AsyncIterable<AIMessage> {
    const { stream, getSnapshot, threadId } = opts;
    const lastUserQuestion =
      opts.inboundMessage !== undefined
        ? this.extractUserQuestion(opts.inboundMessage)
        : opts.lastUserQuestion;

    const knownMessageIds = await this.readKnownMessageIds(getSnapshot);
    const isReplay = (msg: unknown): boolean => {
      const id = (msg as { id?: unknown })?.id;
      return typeof id === 'string' && knownMessageIds.has(id);
    };

    const interruptPayloads: unknown[] = [];
    let yielded = 0;
    let composerFinalText: string | undefined;

    for await (const chunk of stream) {
      const namespace = Array.isArray(chunk) ? chunk[0] : undefined;
      const payload = Array.isArray(chunk) ? chunk[1] : chunk;
      if (!payload || typeof payload !== 'object') continue;
      const fromComposer = this.isComposerNamespace(namespace);

      for (const [nodeKey, nodeDelta] of Object.entries(
        payload as Record<string, unknown>,
      )) {
        if (nodeKey === '__interrupt__' && Array.isArray(nodeDelta)) {
          for (const intr of nodeDelta) {
            interruptPayloads.push((intr as { value?: unknown })?.value);
          }
          continue;
        }
        if (!nodeDelta || typeof nodeDelta !== 'object') continue;
        const messages = (nodeDelta as { messages?: unknown[] }).messages;
        if (!Array.isArray(messages)) continue;

        for (const msg of messages) {
          const type = this.messageType(msg);

          if (isReplay(msg)) continue;

          if (type === 'ai') {
            const calls = this.toolCalls(msg);
            for (const call of calls) {
              if (call.name !== 'send_text') continue;
              const content = this.callContent(call);
              if (!content) continue;
              yielded += 1;
              yield this.textDelivery(content, this.callQuotedSourceId(call));
            }
            if (fromComposer && calls.length === 0) {
              const text = this.extractContent(msg)?.trim();
              if (text) composerFinalText = text;
            }
            continue;
          }

          if (type === 'tool' && this.messageName(msg) === 'send_audio') {
            const raw = this.extractContent(msg)?.trim();
            if (!raw) continue;
            for (const out of this.audioDeliveries(raw)) {
              yielded += 1;
              yield out;
            }
          }
        }
      }
    }

    let snapshot: unknown = null;
    try {
      snapshot = await getSnapshot();
    } catch (err) {
      this.baseLogger.warn(
        `[stream] final snapshot read failed for thread="${threadId}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const prefersAudio =
      this.snapshotPrefersAudio(snapshot) ||
      isProactiveAudioRequest(lastUserQuestion);
    if (snapshot && typeof snapshot === 'object') {
      const tasks =
        (
          snapshot as {
            tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }>;
          }
        ).tasks ?? [];
      for (const task of tasks) {
        for (const intr of task.interrupts ?? []) {
          interruptPayloads.push(intr.value);
        }
      }
    }

    const seenIntr = new Set<string>();
    for (const raw of interruptPayloads) {
      let fp: string;
      try {
        fp = JSON.stringify(raw);
      } catch {
        fp = String(raw);
      }
      if (seenIntr.has(fp)) continue;
      seenIntr.add(fp);

      const intr = InterruptPayloads.classify(raw);
      if (!intr) continue;
      if (intr.kind === 'audio_consent') {
        yielded += 1;
        yield new AIMessage(intr.rawMessage);
      } else {
        const text = await this.interruptHumanizer.humanize({
          rawMessage: intr.rawMessage,
          kind: intr.kind,
          userName: pushName,
          ...(lastUserQuestion ? { lastUserQuestion } : {}),
        });
        if (prefersAudio) {
          for (const out of this.audioDeliveries(`<AUDIO>${text}`)) {
            yielded += 1;
            yield out;
          }
        } else {
          yielded += 1;
          yield new AIMessage(text);
        }
      }
    }

    if (yielded === 0 && composerFinalText) {
      const fallbackDeliveries = prefersAudio
        ? this.audioDeliveries(`<AUDIO>${composerFinalText}`)
        : splitTextIntoSegments(composerFinalText).map(
            (c) => new AIMessage({ content: c }),
          );
      this.baseLogger.warn(
        `[stream] composer produced no send_text/send_audio for thread="${threadId}" — shipping its final plain text in ${fallbackDeliveries.length} part(s) (${composerFinalText.length} chars, prefersAudio=${prefersAudio})`,
      );
      for (const out of fallbackDeliveries) {
        yielded += 1;
        yield out;
      }
    }

    this.baseLogger.log(
      `[stream] complete for thread="${threadId}" — ${yielded} message(s) delivered`,
    );
  }

  protected async readKnownMessageIds(
    getSnapshot: () => Promise<unknown>,
  ): Promise<Set<string>> {
    try {
      const snapshot = await getSnapshot();
      const messages = (
        snapshot as { values?: { messages?: Array<{ id?: unknown }> } } | null
      )?.values?.messages;
      if (!Array.isArray(messages)) return new Set();
      const ids = messages
        .map((m) => (typeof m?.id === 'string' ? m.id : undefined))
        .filter((id): id is string => !!id);
      return new Set(ids);
    } catch {
      return new Set();
    }
  }

  protected snapshotPrefersAudio(snapshot: unknown): boolean {
    const values = (snapshot as { values?: { audioPref?: unknown } } | null)
      ?.values;
    const pref = values?.audioPref as
      | { allowed?: boolean; preferred?: boolean }
      | undefined;
    return pref?.allowed === true && pref?.preferred === true;
  }

  protected isComposerNamespace(namespace: unknown): boolean {
    if (namespace === undefined) return true;
    return Array.isArray(namespace) && namespace.length === 0;
  }

  protected messageType(msg: unknown): string | undefined {
    if (!msg || typeof msg !== 'object') return undefined;
    const m = msg as {
      getType?: () => string;
      _getType?: () => string;
      type?: string;
      role?: string;
    };
    return m.getType?.() ?? m._getType?.() ?? m.type ?? m.role;
  }

  protected messageName(msg: unknown): string | undefined {
    const name = (msg as { name?: unknown })?.name;
    return typeof name === 'string' ? name : undefined;
  }

  protected toolCalls(msg: unknown): Array<{ name?: string; args?: unknown }> {
    const calls = (msg as { tool_calls?: unknown })?.tool_calls;
    return Array.isArray(calls)
      ? (calls as Array<{ name?: string; args?: unknown }>)
      : [];
  }

  private callContent(call: { args?: unknown }): string | undefined {
    const content = (call.args as { content?: unknown })?.content;
    const trimmed = typeof content === 'string' ? content.trim() : '';
    return trimmed || undefined;
  }

  private callQuotedSourceId(call: { args?: unknown }): string | undefined {
    const id = (call.args as { quotedSourceId?: unknown })?.quotedSourceId;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }

  private textDelivery(content: string, quotedSourceId?: string): AIMessage {
    if (quotedSourceId) {
      return new AIMessage({
        content,
        additional_kwargs: { whatsapp_quoted_source_id: quotedSourceId },
      });
    }
    return new AIMessage({ content });
  }

  private audioDeliveries(raw: string): AIMessage[] {
    if (raw.startsWith('<AUDIO>')) {
      const audioText = raw.replace(/^<AUDIO>\s*/, '').trim();
      if (!audioText) return [];
      return chunkAudioText(audioText).map((c) => new AIMessage(`<AUDIO>${c}`));
    }
    const trimmed = raw.trim();
    if (!trimmed) return [];
    return chunkAudioText(trimmed, TEXT_SEGMENT_MAX_CHARS).map(
      (c) => new AIMessage({ content: c }),
    );
  }

  abstract replyMessage(
    text: string,
    options: ChannelReplyOptions,
  ): Promise<void>;

  abstract startTyping(options: ChannelPresenceOptions): Promise<void>;

  abstract startAudioRecording(options: ChannelPresenceOptions): Promise<void>;

  abstract markRead(keys: ChannelReadReceiptKey[]): Promise<void>;

  protected abstract deliverText(text: string, threadId: string): Promise<void>;

  protected abstract deliverAudio(
    text: string,
    threadId: string,
  ): Promise<void>;

  protected abstract deliverQuotedText(
    text: string,
    threadId: string,
    quotedMessageId: string,
    quotedExcerpt: string | undefined,
  ): Promise<void>;

  protected extractInboundSources(message: unknown): ChannelInboundSource[] {
    const kwargs = (
      message as {
        additional_kwargs?: {
          inbound?: { sources?: Array<{ id?: unknown; excerpt?: unknown }> };
        };
      } | null
    )?.additional_kwargs;
    const sources = kwargs?.inbound?.sources;
    if (!Array.isArray(sources)) return [];
    return sources
      .map((s) => ({
        id: typeof s.id === 'string' ? s.id : '',
        excerpt: typeof s.excerpt === 'string' ? s.excerpt : undefined,
      }))
      .filter((s) => s.id);
  }

  protected extractUserQuestion(message: unknown): string | undefined {
    const content = (message as { content?: unknown } | null)?.content;
    return typeof content === 'string' ? content : undefined;
  }

  protected extractContent(message: unknown): string | undefined {
    if (typeof message === 'string') return message;
    if (!message || typeof message !== 'object') return undefined;
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string') return content;
    return content?.toString?.();
  }

  protected extractQuotedSourceId(message: unknown): string | undefined {
    if (!message || typeof message !== 'object') return undefined;
    const kwargs = (message as { additional_kwargs?: Record<string, unknown> })
      .additional_kwargs;
    const id = kwargs?.whatsapp_quoted_source_id;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }
}
