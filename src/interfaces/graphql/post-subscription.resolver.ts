import { UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Resolver, Subscription } from '@nestjs/graphql';
import { subscribeAsAsyncIterable, SubscriptionBus } from '../../cqsrs';
import { OnPostCreatedSubscription } from '../../application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from '../../application/post/subscription/on-post-updated.subscription';
import { PostCreatedEvent } from '../../domain/post/event/post-created.event';
import { PostUpdatedEvent } from '../../domain/post/event/post-updated.event';
import { PostView } from '../../dto/graphql/post.view';
import { MapSubscriptionInterceptor } from '../interceptors/map-subscription.interceptor';

/**
 * Camada de interface das **subscriptions** GraphQL — a borda do `SubscriptionBus`.
 *
 * O resolver faz exatamente uma coisa: traduzir os argumentos do protocolo no critério da subscription
 * (`postId` → `new OnPostUpdatedSubscription.OnPostUpdated({ postId })`). A travessia evento → view
 * saiu daqui e virou o `MapSubscriptionInterceptor`.
 *
 * O que ele não faz: filtrar. O filtro é o método da subscription, na camada de aplicação, e roda
 * dentro do stream — então sumiu o `filter` do `@Subscription` daqui, e o assinante de um `postId` já
 * recebe do bus só os eventos daquele post. Sumiu também o `await`: uma subscription não é uma promessa
 * que resolve, é um stream que abre.
 *
 * ## `resolve`
 * Por padrão o graphql-js procura o campo pelo nome dentro do payload (`payload.onPostUpdated`).
 * Como o iterador entrega a `PostView` direto, `resolve` diz que o payload **é** o valor.
 */
/**
 * **Lacuna conhecida:** na versão Axon toda operação exige autenticação — o `leitor@example.com`
 * existe justamente para demonstrar acesso só de leitura. Aqui as leituras estão abertas porque a
 * sessão ainda não é propagada pela conexão WebSocket das subscriptions, e deixar metade autenticada
 * seria pior que assumir a dívida por escrito. As escritas já exigem sessão e papel.
 */
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
