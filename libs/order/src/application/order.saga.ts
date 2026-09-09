import { Injectable } from '@nestjs/common';
import { type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { EnqueueCommand } from '@app/messaging';
import { map, type Observable } from 'rxjs';
import {
  OrderPlacedEvent,
  PaymentAuthorizedEvent,
  PaymentCapturedEvent,
  PaymentDeclinedEvent,
} from '../domain/event/order-event';
import { API_SERVICE, OrderPattern, PAYMENTS_SERVICE } from './order-routes';

/**
 * A **saga coreografada** do pedido: quatro regras de "aconteceu isto → peça aquilo", e nenhum
 * orquestrador. Ninguém conhece o fluxo inteiro; cada serviço conhece a sua reação ao que acabou de
 * acontecer, e o fluxo *emerge* disso.
 *
 * ```
 *   OrderStarted   ──► enfileira payment.authorize   em PAYMENTS
 *   PaymentAuthorized ──► enfileira payment.capture     em PAYMENTS
 *   PaymentCaptured   ──► enfileira pedido.complete   em API
 *   PaymentDeclined   ──► enfileira pedido.fail       em API
 * ```
 *
 * ## Uma classe, dois serviços, e por que ela não roda duas vezes
 * Esta classe está numa lib, e **os dois serviços a registram** — inclusive as regras que não são
 * "deles". Isso parece um convite à duplicação: se o `PaymentAuthorizedEvent` chegasse ao `EventBus`
 * dos dois, os dois enfileirariam a captura, e o cliente seria cobrado duas vezes.
 *
 * Não chega. Uma saga do @nestjs/cqrs escuta o `EventBus`, e no `EventBus` só entra o que foi
 * publicado **naquele processo**. O que vem de outro serviço entra no `RemoteEventBus`, que alimenta
 * só as subscriptions. Então cada regra dispara exatamente uma vez: no serviço onde o fato aconteceu.
 *
 * O efeito prático é que registrar a saga inteira nos dois lados é *inofensivo*, e isso é o que
 * permite ela ser uma peça só. As regras que não são deste serviço simplesmente nunca veem o evento
 * que as ativaria. Ver {@link RemoteEventBus} e {@link EventStream}.
 *
 * ## Por que `EnqueueCommand`, e não o command final
 * A saga poderia emitir `AuthorizePaymentCommand` direto — e ele seria executado *aqui*, no serviço
 * errado. Emitindo `EnqueueCommand` ela diz **para quem** e **o quê**, e o handler dele coloca na
 * fila do dono. A saga fica sem transporte nenhum no vocabulário: nada de `ClientProxy`, nada de
 * RabbitMQ, nada de fila.
 *
 * Todas as regras carregam a `key` adiante — é ela que amarra os passos dos dois serviços ao mesmo
 * pedido, e é por ela que o cliente escuta o progresso.
 */
@Injectable()
export class OrderSaga {
  @Saga()
  authorizeOnOrderStarted = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(OrderPlacedEvent),
      map(
        (event) =>
          new EnqueueCommand(PAYMENTS_SERVICE, OrderPattern.AUTHORIZE, {
            key: event.key,
            orderId: event.orderId,
            amount: event.amount,
          }),
      ),
    );

  @Saga()
  captureOnPaymentAuthorized = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PaymentAuthorizedEvent),
      map((event) => new EnqueueCommand(PAYMENTS_SERVICE, OrderPattern.CAPTURE, { key: event.key })),
    );

  @Saga()
  completeOnPaymentCaptured = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PaymentCapturedEvent),
      map(
        (event) =>
          new EnqueueCommand(API_SERVICE, OrderPattern.COMPLETE, { key: event.key, receiptId: event.receiptId }),
      ),
    );

  @Saga()
  failOnPaymentDeclined = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PaymentDeclinedEvent),
      map((event) => new EnqueueCommand(API_SERVICE, OrderPattern.FAIL, { key: event.key, reason: event.reason })),
    );
}
