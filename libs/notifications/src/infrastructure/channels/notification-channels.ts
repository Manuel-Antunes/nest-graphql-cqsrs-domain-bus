import { Inject, Injectable } from '@nestjs/common';

import type { NotificationChannel } from '../../domain/channel/notification-channel';

export const NOTIFICATION_CHANNELS = Symbol.for(
  'nestposts.notifications.channels',
);

export const InjectNotificationChannels = () => Inject(NOTIFICATION_CHANNELS);

export class UnknownNotificationChannelException extends Error {
  constructor(readonly channel: string) {
    super(`no notification channel is registered as "${channel}"`);
    this.name = 'UnknownNotificationChannelException';
  }
}

/** Every channel this process delivers through, by name. */
@Injectable()
export class NotificationChannels {
  private readonly byName: ReadonlyMap<string, NotificationChannel>;

  constructor(@InjectNotificationChannels() channels: NotificationChannel[]) {
    this.byName = new Map(channels.map((channel) => [channel.name, channel]));
  }

  named(name: string): NotificationChannel {
    const channel = this.byName.get(name);
    if (!channel) throw new UnknownNotificationChannelException(name);
    return channel;
  }

  names(): readonly string[] {
    return [...this.byName.keys()];
  }
}
