import 'server-only';

import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { NOTIFICATIONS_NAMESPACE } from '@nestposts/notifications/domain/notifications.namespace';
import type { ITransportPublisherEventBus } from '@nestposts/transport-eventbus';
import { Publisher } from '@nestposts/transport-eventbus';

import { WEB_EVENTS_CLIENT } from './transport';

@Injectable()
@Publisher(NOTIFICATIONS_NAMESPACE)
export class NotificationsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(WEB_EVENTS_CLIENT) readonly client: ClientProxy) {}
}
