import 'server-only';

import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { NOTIFICATIONS_NAMESPACE } from '@nestposts/notifications/domain/notifications.namespace';
import type { ITransportPublisherEventBus } from '@nestposts/transport-eventbus';
import { Publisher } from '@nestposts/transport-eventbus';

import { WebEventsClient } from './web-events.client';

@Injectable()
@Publisher(NOTIFICATIONS_NAMESPACE)
export class NotificationsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(WebEventsClient) readonly client: ClientProxy) {}
}
