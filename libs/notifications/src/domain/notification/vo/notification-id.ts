import { createHash, randomUUID } from 'node:crypto';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { NotificationIdSchema } from '../schemas/notification-id.schema';

const NOTIFICATION_NAMESPACE = Buffer.from(
  '9c3f1d2a7b4e4f0a8e6d5c1b2a394857',
  'hex',
);

const asUuid = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

export class NotificationId extends ValidatedDto.Scalar(NotificationIdSchema) {
  static generate(): NotificationId {
    return NotificationId.parse(randomUUID());
  }

  /** A version-5 UUID over `parts`: the same parts always name the same notification. */
  static derive(...parts: readonly string[]): NotificationId {
    const hash = createHash('sha1')
      .update(NOTIFICATION_NAMESPACE)
      .update(parts.join('\u0000'))
      .digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    return NotificationId.parse(asUuid(hash.subarray(0, 16).toString('hex')));
  }
}
