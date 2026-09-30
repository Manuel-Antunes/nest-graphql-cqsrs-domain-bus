import { Inject, Injectable, Logger } from '@nestjs/common';

import { InterruptMessageHumanizer } from '../services/interrupt-message-humanizer.service';
import {
  type ChannelPresenceOptions,
  type ChannelReadReceiptKey,
  type ChannelReplyOptions,
  ChannelResponseProcessor,
} from './channel-response-processor';

export interface RecordedDelivery {
  kind: 'text' | 'audio' | 'quoted-text';
  threadId: string;
  text: string;
  quotedMessageId?: string;
  quotedExcerpt?: string;
}

@Injectable()
export class InMemoryChannelResponseProcessor extends ChannelResponseProcessor {
  readonly deliveries: RecordedDelivery[] = [];
  readonly presenceCalls: Array<{
    kind: 'typing' | 'audio';
    threadId: string;
  }> = [];
  readonly markedRead: ChannelReadReceiptKey[] = [];

  private readonly logger = new Logger(InMemoryChannelResponseProcessor.name);

  constructor(
    @Inject(InterruptMessageHumanizer)
    interruptHumanizer: InterruptMessageHumanizer,
  ) {
    super(interruptHumanizer);
  }

  override async replyMessage(
    text: string,
    options: ChannelReplyOptions,
  ): Promise<void> {
    this.deliveries.push({
      kind: 'quoted-text',
      threadId: options.threadId,
      text,
      quotedMessageId: options.quotedMessageId,
      quotedExcerpt: options.quotedText,
    });
    this.logger.log(`[reply] thread=${options.threadId} ${this.preview(text)}`);
  }

  override async startTyping(options: ChannelPresenceOptions): Promise<void> {
    this.presenceCalls.push({ kind: 'typing', threadId: options.threadId });
  }

  override async startAudioRecording(
    options: ChannelPresenceOptions,
  ): Promise<void> {
    this.presenceCalls.push({ kind: 'audio', threadId: options.threadId });
  }

  override async markRead(keys: ChannelReadReceiptKey[]): Promise<void> {
    this.markedRead.push(...keys);
  }

  protected override async deliverText(
    text: string,
    threadId: string,
  ): Promise<void> {
    this.deliveries.push({ kind: 'text', threadId, text });
    this.logger.log(`[text] thread=${threadId} ${this.preview(text)}`);
  }

  protected override async deliverAudio(
    text: string,
    threadId: string,
  ): Promise<void> {
    this.deliveries.push({ kind: 'audio', threadId, text });
    this.logger.log(`[audio] thread=${threadId} ${this.preview(text)}`);
  }

  protected override async deliverQuotedText(
    text: string,
    threadId: string,
    quotedMessageId: string,
    quotedExcerpt: string | undefined,
  ): Promise<void> {
    this.deliveries.push({
      kind: 'quoted-text',
      threadId,
      text,
      quotedMessageId,
      ...(quotedExcerpt !== undefined ? { quotedExcerpt } : {}),
    });
    this.logger.log(
      `[quoted] thread=${threadId} quoted=${quotedMessageId} ${this.preview(text)}`,
    );
  }

  private preview(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
  }
}
