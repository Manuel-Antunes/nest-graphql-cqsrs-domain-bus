/**
 * Propriedade fantasma que carrega o tipo do evento de uma subscription — o mesmo truque do
 * `RESULT_TYPE_SYMBOL` que o `Query<T>` do @nestjs/cqrs usa para o tipo do resultado.
 *
 * Ela não existe em runtime e nunca é lida: serve só para o compilador resolver o `TEvent` de uma
 * `ISubscription`, e portanto para o `subscribe(sub)` devolver um `Observable<TEvent>` certo e para o
 * `ISubscriptionHandler<T>` conferir o que o handler devolve.
 *
 * Mora aqui, e não na classe `Subscription`, porque é parte do **contrato**: quem implementa a
 * interface direto declara `readonly [EVENT_TYPE_SYMBOL]: MeuEvento;` e ganha a mesma resolução de
 * tipo que quem herda da classe.
 */
export const EVENT_TYPE_SYMBOL = Symbol('EVENT_TYPE');
