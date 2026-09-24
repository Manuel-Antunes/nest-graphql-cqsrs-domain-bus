import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import type { INotifiable } from './notifiable';
import { NotificationRecipientSchema } from './schemas/notification-recipient.schema';

/**
 * A notifiable as it was when it was notified: its kind, id and name, and the route of every channel
 * the notification goes through. It is what travels with the notification and what a channel
 * delivers to, because whoever delivers does not hold the aggregate.
 */
export class NotificationRecipient
  extends ValidatedDto(NotificationRecipientSchema)
  implements INotifiable
{
  static of(
    notifiable: INotifiable,
    channels: readonly string[],
  ): NotificationRecipient {
    const routes: Record<string, string> = {};
    for (const channel of channels) {
      const route = notifiable.routeNotificationFor(channel);
      if (route !== undefined) routes[channel] = route;
    }
    return new NotificationRecipient({
      notifiableType: notifiable.notifiableType,
      notifiableId: notifiable.notifiableId,
      notifiableName: notifiable.notifiableName,
      routes,
    });
  }

  routeNotificationFor(channel: string): string | undefined {
    return this.routes[channel];
  }
}
