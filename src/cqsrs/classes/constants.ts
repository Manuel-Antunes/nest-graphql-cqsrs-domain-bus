/**
 * Propriedade fantasma que carrega o tipo do evento de uma `Subscription` — o mesmo truque do
 * `RESULT_TYPE_SYMBOL` que o `Query<T>` do @nestjs/cqrs usa para o tipo do resultado. Não existe em
 * runtime: só serve para o `SubscriptionBus.subscribe(sub)` inferir `Observable<TEvent>`.
 */
export const EVENT_TYPE_SYMBOL = Symbol('EVENT_TYPE');
