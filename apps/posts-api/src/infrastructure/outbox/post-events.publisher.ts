import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { NOTIFICATIONS_NAMESPACE } from '@nestposts/notifications/domain/notifications.namespace';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import type { ITransportPublisherEventBus } from '@nestposts/transport-eventbus';
import { Publisher } from '@nestposts/transport-eventbus';

import { POST_EVENTS_CLIENT } from '../transport/transport.config';

@Injectable()
@Publisher([POSTS_NAMESPACE, NOTIFICATIONS_NAMESPACE])
export class PostEventsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(POST_EVENTS_CLIENT) readonly client: ClientProxy) {}
}
