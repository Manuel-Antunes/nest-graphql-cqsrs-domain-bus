import { randomUUID } from 'node:crypto';
import type { OnModuleDestroy } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import type { Message, Messaging } from 'firebase-admin/messaging';

import type { PushDelivery } from '../../domain/channel/push-notifications';
import { PushNotifications } from '../../domain/channel/push-notifications';
import type { PushMessage } from '../../domain/channel/schemas/push-message.schema';
import type { FirebasePushOptions } from './firebase.options';

const messageFor = (token: string, message: PushMessage): Message => ({
  token,
  notification: message.notification,
  data: message.data,
  android: message.android,
  apns: message.apns?.payload
    ? {
        payload: message.apns.payload as NonNullable<
          Message['apns']
        >['payload'],
      }
    : undefined,
  webpush: message.webpush,
});

/**
 * Push through Firebase Cloud Messaging. The SDK is loaded only when credentials are configured, and
 * each instance is an app of its own, deleted when the module is.
 */
export class FirebasePushNotifications
  extends PushNotifications
  implements OnModuleDestroy
{
  private constructor(
    private readonly app: App,
    private readonly messaging: Messaging,
  ) {
    super();
  }

  static async from({
    credentials,
  }: FirebasePushOptions): Promise<FirebasePushNotifications> {
    const { cert, initializeApp } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = initializeApp(
      {
        credential: cert({
          projectId: credentials.project_id,
          clientEmail: credentials.client_email,
          privateKey: credentials.private_key,
        }),
      },
      `nestposts-${randomUUID()}`,
    );
    return new FirebasePushNotifications(app, getMessaging(app));
  }

  async send(
    tokens: readonly string[],
    message: PushMessage,
  ): Promise<PushDelivery> {
    if (tokens.length === 0) return { delivered: 0, failed: [] };
    const response = await this.messaging.sendEach(
      tokens.map((token) => messageFor(token, message)),
    );
    return {
      delivered: response.successCount,
      failed: response.responses.flatMap((result, index) =>
        result.success
          ? []
          : [
              {
                token: tokens[index],
                reason: result.error?.message ?? 'unknown error',
              },
            ],
      ),
    };
  }

  async onModuleDestroy(): Promise<void> {
    const { deleteApp } = await import('firebase-admin/app');
    await deleteApp(this.app);
  }
}
