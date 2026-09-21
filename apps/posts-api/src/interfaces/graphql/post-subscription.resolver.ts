import { UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Resolver, Subscription } from '@nestjs/graphql';
import { subscribeAsAsyncIterable, SubscriptionBus } from '@nestposts/cqsrs';
import { OnPostCreatedSubscription } from '../../application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from '../../application/post/subscription/on-post-updated.subscription';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { PostView } from '../../dto/graphql/post.view';
import { MapSubscriptionInterceptor } from '../interceptors/map-subscription.interceptor';

@AllowAnonymous()
@Resolver('Post')
export class PostSubscriptionResolver {
  constructor(private readonly subscriptionBus: SubscriptionBus) {}

  @Subscription('onPostCreated', { resolve: (payload: PostView) => payload })
  @UseInterceptors(MapSubscriptionInterceptor(PostCreatedEvent, PostView))
  onPostCreated(): AsyncIterable<PostCreatedEvent> {
    return subscribeAsAsyncIterable(
      this.subscriptionBus,
      new OnPostCreatedSubscription.OnPostCreated(),
    );
  }

  @Subscription('onPostUpdated', { resolve: (payload: PostView) => payload })
  @UseInterceptors(MapSubscriptionInterceptor(PostUpdatedEvent, PostView))
  onPostUpdated(@Args('postId') postId?: string | null): AsyncIterable<PostUpdatedEvent> {
    return subscribeAsAsyncIterable(
      this.subscriptionBus,
      new OnPostUpdatedSubscription.OnPostUpdated({ postId }),
    );
  }
}
