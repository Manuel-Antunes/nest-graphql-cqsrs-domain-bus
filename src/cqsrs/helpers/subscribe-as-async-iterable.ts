import { map, type Observable } from 'rxjs';
import type { Subscription } from '../classes/subscription';
import type { ISubscriptionBus } from '../interfaces/subscription-bus.interface';
import { observableToAsyncIterable } from './observable-to-async-iterable';

/**
 * O helper da camada de interface: pede a subscription ao bus, projeta cada evento para a forma do
 * protocolo e devolve o async iterable que o transporte consome. É a linha inteira de um resolver de
 * subscription GraphQL:
 *
 * ```ts
 * @Subscription(() => PostView, { name: 'onPostUpdated', resolve: (payload: PostView) => payload })
 * onPostUpdated(@Args('postId', { type: () => ID, nullable: true }) postId?: string | null) {
 *   return subscribeAsAsyncIterable(
 *     this.subscriptionBus,
 *     new OnPostUpdatedSubscription({ postId }),
 *     (event) => this.viewMapper.fromUpdatedEvent(event),
 *   );
 * }
 * ```
 *
 * Repare no que a interface faz e no que ela não faz: ela **monta o critério** com os argumentos do
 * protocolo (`postId`) e **traduz o evento** para a view. Ela não filtra — o filtro é o método da
 * subscription, na camada de aplicação, e roda dentro do stream. Sem `filter` no `@Subscription`,
 * sem `filter()` no Observable do resolver.
 *
 * Nada aqui importa GraphQL: um async iterable é o contrato de qualquer consumidor *pull*.
 *
 * @param bus O `SubscriptionBus`.
 * @param subscription A subscription pedida, já com o critério.
 * @param project Evento → o que o assinante recebe. O padrão entrega o evento como veio.
 */
export function subscribeAsAsyncIterable<TEvent, TOut = TEvent>(
  bus: ISubscriptionBus,
  subscription: Subscription<TEvent, any>,
  project: (event: TEvent) => TOut = (event) => event as unknown as TOut,
): AsyncIterableIterator<TOut> {
  const stream: Observable<TEvent> = bus.subscribe(subscription);
  return observableToAsyncIterable(stream.pipe(map(project)));
}
