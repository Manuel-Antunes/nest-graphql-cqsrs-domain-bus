import type { Message } from '@a2a-js/sdk';

import { BaseExtension } from '../extension';

export class MessageTimestampsExtension extends BaseExtension {
  static readonly METADATA_KEY = 'timestamp';

  readonly name = 'message-timestamps';
  readonly version = 'v1';
  readonly description =
    'Per-message creation time, projected from the checkpoint the message first appeared in.';

  stamp(message: Message, createdAt: Date | null | undefined): void {
    if (!createdAt) return;
    message.metadata = {
      ...(message.metadata ?? {}),
      [MessageTimestampsExtension.METADATA_KEY]: createdAt.toISOString(),
    };
    this.claim(message);
  }
}
