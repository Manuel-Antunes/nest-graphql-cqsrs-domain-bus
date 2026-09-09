import type { AsyncContext } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import type { ISubscription } from './subscription.interface';

/**
 * O contrato do bus de subscriptions. `subscribe` está para ele como `execute` está para o
 * `QueryBus`: acha o handler da mensagem e devolve o resultado — que aqui é um stream, vivo até
 * quem se inscreveu cancelar.
 *
 * Uma assinatura só, e não as quatro sobrecargas do `QueryBus`. Ele precisa delas porque `IQuery` é
 * um marcador vazio: sem o `Query<TResult>` não há de onde tirar o tipo do resultado. Aqui a
 * {@link ISubscription} já carrega o tipo do evento, então toda mensagem — herdeira de
 * `Subscription` ou não — é igualmente tipada.
 */
export interface ISubscriptionBus {
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   * @param asyncContext O contexto de um handler request-scoped.
   */
  subscribe<TEvent>(subscription: ISubscription<TEvent>, asyncContext?: AsyncContext): Observable<TEvent>;
}
