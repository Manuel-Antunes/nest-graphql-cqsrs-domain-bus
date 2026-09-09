import { Args, ID, Resolver, Subscription } from '@nestjs/graphql';
import { subscribeAsAsyncIterable, SubscriptionBus } from '../../cqsrs';
import { OnPostCreatedSubscription } from '../../application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from '../../application/post/subscription/on-post-updated.subscription';
import { PostView } from '../../dto/graphql/post.view';
import { PostViewMapper } from '../../mapper/post-view.mapper';

/**
 * Camada de interface das **subscriptions** GraphQL — a borda do `SubscriptionBus`.
 *
 * O resolver faz exatamente duas coisas, e as duas são tradução:
 *
 * 1. **argumentos do protocolo → critério da subscription** (`postId` → `new OnPostUpdatedSubscription.OnPostUpdated({ postId })`);
 * 2. **evento do domínio → view do protocolo** (`PostUpdatedEvent` → `PostView`).
 *
 * O que ele não faz mais: filtrar. O filtro é o método da subscription, na camada de aplicação, e
 * roda dentro do stream — então sumiu o `filter` do `@Subscription` daqui, e o assinante de um
 * `postId` já recebe do bus só os eventos daquele post. Sumiu também o `await`: uma subscription não
 * é uma promessa que resolve, é um stream que abre.
 *
 * ## `resolve`
 * Por padrão o graphql-js procura o campo pelo nome dentro do payload (`payload.onPostUpdated`).
 * Como o iterador entrega a `PostView` direto, `resolve` diz que o payload **é** o valor.
 */
@Resolver(() => PostView)
export class PostSubscriptionResolver {
  constructor(
    private readonly subscriptionBus: SubscriptionBus,
    private readonly viewMapper: PostViewMapper,
  ) {}

  @Subscription(() => PostView, {
    name: 'onPostCreated',
    description: 'Emite a cada PostCreated (tópico global)',
    resolve: (payload: PostView) => payload,
  })
  onPostCreated(): AsyncIterable<PostView> {
    return subscribeAsAsyncIterable(this.subscriptionBus, new OnPostCreatedSubscription.OnPostCreated(), (event) =>
      this.viewMapper.fromCreatedEvent(event),
    );
  }

  @Subscription(() => PostView, {
    name: 'onPostUpdated',
    description: 'Emite a cada PostUpdated; postId filtra por tópico (null = todos)',
    resolve: (payload: PostView) => payload,
  })
  onPostUpdated(
    @Args('postId', { type: () => ID, nullable: true }) postId?: string | null,
  ): AsyncIterable<PostView> {
    return subscribeAsAsyncIterable(this.subscriptionBus, new OnPostUpdatedSubscription.OnPostUpdated({ postId }), (event) =>
      this.viewMapper.fromUpdatedEvent(event),
    );
  }
}
