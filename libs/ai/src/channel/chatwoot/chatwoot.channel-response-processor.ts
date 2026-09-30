import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { RequestCredentials } from '@nestposts/auth/infrastructure/request/request-credentials';
import { RequestHeaders } from '@nestposts/auth/infrastructure/request/request-headers';
import { TENANT_HEADER } from '@nestposts/database/tenancy/tenant';

import aiConfig, { type AiConfig } from '../../config/ai.config';
import { InterruptMessageHumanizer } from '../../services/interrupt-message-humanizer.service';
import type { TTSService } from '../../services/tts.service';
import {
  type ChannelPresenceOptions,
  type ChannelReadReceiptKey,
  type ChannelReplyOptions,
  ChannelResponseProcessor,
} from '../channel-response-processor';
import { ChatwootConversations } from './chatwoot-conversations';

@Injectable({ scope: Scope.REQUEST })
export class ChatwootChannelResponseProcessor extends ChannelResponseProcessor {
  static readonly INTER_MESSAGE_GAP_MS = 1500;
  private static readonly AUDIO_MIN_CHARS = 100;

  private readonly logger = new Logger(ChatwootChannelResponseProcessor.name);
  private readonly conversations: ChatwootConversations;
  private lastScheduledSendAt = 0;

  constructor(
    @Inject(REQUEST) request: unknown,
    @Inject(aiConfig.KEY) config: AiConfig,
    @Inject('TTS_SERVICE') private readonly tts: TTSService,
    @Inject(InterruptMessageHumanizer)
    interruptHumanizer: InterruptMessageHumanizer,
  ) {
    super(interruptHumanizer);
    const credentials = RequestCredentials.of(request);
    if (credentials.isAnonymous) {
      throw new Error(
        'ChatwootChannelResponseProcessor: the request carries no credential — refusing to call Chatwoot unauthenticated',
      );
    }
    const tenant = RequestHeaders.from(request).get(TENANT_HEADER);
    this.conversations = new ChatwootConversations(config.GATEWAY_URL, {
      ...credentials.toHeaders(),
      ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
    });
  }

  override async replyMessage(
    text: string,
    options: ChannelReplyOptions,
  ): Promise<void> {
    await this.startTyping({ threadId: options.threadId });
    await this.createMessage(Number(options.threadId), text, {
      in_reply_to: Number(options.quotedMessageId),
    });
  }

  override async startTyping(options: ChannelPresenceOptions): Promise<void> {
    await this.toggleTyping(Number(options.threadId));
  }

  override async startAudioRecording(
    options: ChannelPresenceOptions,
  ): Promise<void> {
    await this.toggleTyping(Number(options.threadId));
  }

  override async markRead(keys: ChannelReadReceiptKey[]): Promise<void> {
    const conversationId = Number(keys[0]?.remoteJid);
    if (!Number.isFinite(conversationId)) return;
    try {
      await this.conversations.markSeen(conversationId);
    } catch (error) {
      this.logger.warn(
        `[markRead] conversation=${conversationId}: ${ChatwootChannelResponseProcessor.messageOf(error)}`,
      );
    }
  }

  protected override async deliverText(
    text: string,
    threadId: string,
  ): Promise<void> {
    await this.createMessage(Number(threadId), text);
  }

  protected override async deliverQuotedText(
    text: string,
    threadId: string,
    quotedMessageId: string,
  ): Promise<void> {
    await this.createMessage(Number(threadId), text, {
      in_reply_to: Number(quotedMessageId),
    });
  }

  protected override async deliverAudio(
    text: string,
    threadId: string,
  ): Promise<void> {
    const audio = await this.synthesize(text);
    if (!audio) {
      await this.deliverTextInParts(text, threadId);
      return;
    }
    try {
      await this.conversations.createMessage({
        conversationId: Number(threadId),
        messageType: 'outgoing',
        attachments: [
          { data: audio, filename: 'voice.mp3', contentType: 'audio/mpeg' },
        ],
      });
    } catch (error) {
      this.logger.warn(
        `[deliverAudio] conversation=${threadId}, falling back to text: ${ChatwootChannelResponseProcessor.messageOf(error)}`,
      );
      await this.deliverTextInParts(text, threadId);
    }
  }

  private async createMessage(
    conversationId: number,
    content: string,
    contentAttributes: Record<string, unknown> = {},
  ): Promise<void> {
    const delay = this.nextOutboundDelayMs();
    const attributes = {
      ...contentAttributes,
      ...(delay > 0 ? { delay } : {}),
    };
    await this.conversations.createMessage({
      conversationId,
      content,
      messageType: 'outgoing',
      ...(Object.keys(attributes).length
        ? { contentAttributes: attributes }
        : {}),
    });
  }

  private nextOutboundDelayMs(): number {
    const now = Date.now();
    const scheduled =
      this.lastScheduledSendAt === 0
        ? now
        : Math.max(
            now,
            this.lastScheduledSendAt +
              ChatwootChannelResponseProcessor.INTER_MESSAGE_GAP_MS,
          );
    this.lastScheduledSendAt = scheduled;
    return scheduled - now;
  }

  private async toggleTyping(conversationId: number): Promise<void> {
    if (!Number.isFinite(conversationId)) return;
    try {
      await this.conversations.toggleTyping(conversationId, 'on');
    } catch (error) {
      this.logger.warn(
        `[toggleTyping] conversation=${conversationId}: ${ChatwootChannelResponseProcessor.messageOf(error)}`,
      );
    }
  }

  private async synthesize(text: string): Promise<string | null> {
    if (text.length < ChatwootChannelResponseProcessor.AUDIO_MIN_CHARS)
      return null;
    try {
      return await this.tts.textToSpeechBase64(text);
    } catch (error) {
      this.logger.error(
        `[synthesize] TTS failed: ${ChatwootChannelResponseProcessor.messageOf(error)}`,
      );
      return null;
    }
  }

  private static messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
