import type { ClientProxy } from '@nestjs/microservices';
import type { ITransportPublisherEventBus } from '@nestposts/transport-eventbus';
import { Inject, Injectable } from '@nestjs/common';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import { Publisher } from '@nestposts/transport-eventbus';

import { POST_EVENTS_CLIENT } from '../transport/transport.config';

@Injectable()
@Publisher(POSTS_NAMESPACE)
export class PostEventsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(POST_EVENTS_CLIENT) readonly client: ClientProxy) {}
}
