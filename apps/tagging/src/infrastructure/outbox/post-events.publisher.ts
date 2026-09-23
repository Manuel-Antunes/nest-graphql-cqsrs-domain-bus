import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import type { ITransportPublisherEventBus } from '@nestposts/transport-eventbus';
import { Publisher } from '@nestposts/transport-eventbus';

import { POST_EVENTS_CLIENT } from '../transport/transport.config';

/**
 * This service publishes in the `posts` namespace: the fact is the Post's, and it is this service that
 * decided it. Whoever reacts is whoever reacts — nothing here knows that anybody listens.
 */
@Injectable()
@Publisher(POSTS_NAMESPACE)
export class PostEventsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(POST_EVENTS_CLIENT) readonly client: ClientProxy) {}
}
