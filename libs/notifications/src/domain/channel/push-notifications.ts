import type { PushMessage } from './schemas/push-message.schema';

export interface PushDelivery {
  delivered: number;
  failed: { token: string; reason: string }[];
}

/** The provider behind the `push` channel — Firebase Cloud Messaging, here. */
export abstract class PushNotifications {
  abstract send(
    tokens: readonly string[],
    message: PushMessage,
  ): Promise<PushDelivery>;
}
