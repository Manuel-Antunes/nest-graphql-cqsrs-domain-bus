import { TransportType } from '@app/messaging';
import type { IEvent } from '@nestjs/cqrs';
import { Transport } from '@nestjs/microservices';
import { OrderStep } from '../order-step';

/**
 * A base dos fatos do fluxo do pedido — os seis eventos que atravessam os dois serviços.
 *
 * Três campos em comum, e cada um por um motivo:
 *
 * - **`key`**: a chave de idempotência/contexto do cliente. É por ela que a subscription filtra, e é
 *   ela que amarra os eventos dos dois serviços ao mesmo pedido;
 * - **`orderId`**: o pedido, para quem lê;
 * - **`step`**: onde o fluxo está, sem o cliente precisar saber o nome da classe do evento.
 *
 * Ter uma base comum é o que permite a subscription dizer "me dê tudo deste pedido" com um
 * `instanceof OrderEvent`, em vez de listar os seis tipos — e continuar funcionando quando o
 * sétimo aparecer.
 *
 * O payload é feito de primitivos: um evento atravessa processo, é serializado e reconstruído do
 * outro lado. Quem transforma texto em value object é o domínio, na fronteira.
 *
 * ## Cada evento diz por onde viaja
 * O `@TransportType(...)` em cada classe declara os transportes daquele fato — e a decisão é do
 * evento porque quem escreveu o fato é quem sabe o que ele significa. Cinco destes são **avisos**
 * (Redis, difusão: quem estiver ouvindo, ouve; perder um é sobreviver). Um deles moveu dinheiro, e
 * por isso sai **também** por uma fila com ack.
 */
export abstract class OrderEvent implements IEvent {
  protected constructor(
    readonly key: string,
    readonly orderId: string,
    readonly step: OrderStep,
    readonly occurredAt: Date,
  ) {}
}

/** O cliente fez o pedido. Disparado no serviço da API — o único passo que nasce de fora. */
@TransportType(Transport.REDIS)
export class OrderPlacedEvent extends OrderEvent {
  constructor(
    key: string,
    orderId: string,
    readonly amount: number,
    readonly customer: string,
    occurredAt: Date,
  ) {
    super(key, orderId, OrderStep.PLACED, occurredAt);
  }
}

/** O adquirente reservou o valor. Disparado no serviço de pagamentos. */
@TransportType(Transport.REDIS)
export class PaymentAuthorizedEvent extends OrderEvent {
  constructor(
    key: string,
    orderId: string,
    readonly authorizationId: string,
    readonly amount: number,
    occurredAt: Date,
  ) {
    super(key, orderId, OrderStep.AUTHORIZED, occurredAt);
  }
}

/** O adquirente recusou. Disparado no serviço de pagamentos; encerra o fluxo pelo caminho triste. */
@TransportType(Transport.REDIS)
export class PaymentDeclinedEvent extends OrderEvent {
  constructor(
    key: string,
    orderId: string,
    readonly amount: number,
    readonly reason: string,
    occurredAt: Date,
  ) {
    super(key, orderId, OrderStep.DECLINED, occurredAt);
  }
}

/**
 * O valor reservado virou cobrança. Disparado no serviço de pagamentos.
 *
 * **O único que sai por dois transportes.** Como aviso ele vai por difusão, como todos os outros —
 * é o que faz o `CAPTURED` aparecer na subscription. Mas ele moveu dinheiro, e o livro-caixa que
 * registra isso não pode perder nenhum: por isso ele sai *também* por uma fila, com ack e um
 * consumidor só. Dois transportes, dois consumidores, duas garantias — um fato.
 */
@TransportType(Transport.REDIS, Transport.RMQ)
export class PaymentCapturedEvent extends OrderEvent {
  constructor(
    key: string,
    orderId: string,
    readonly receiptId: string,
    readonly amount: number,
    occurredAt: Date,
  ) {
    super(key, orderId, OrderStep.CAPTURED, occurredAt);
  }
}

/** O pedido está pago. Disparado no serviço da API — o fim feliz. */
@TransportType(Transport.REDIS)
export class OrderCompletedEvent extends OrderEvent {
  constructor(
    key: string,
    orderId: string,
    readonly receiptId: string,
    occurredAt: Date,
  ) {
    super(key, orderId, OrderStep.COMPLETED, occurredAt);
  }
}

/** O pedido não vai acontecer. Disparado no serviço da API. */
@TransportType(Transport.REDIS)
export class OrderFailedEvent extends OrderEvent {
  constructor(
    key: string,
    orderId: string,
    readonly reason: string,
    occurredAt: Date,
  ) {
    super(key, orderId, OrderStep.FAILED, occurredAt);
  }
}

/** Os seis, para registrar no serializador de uma vez só. */
export const ORDER_EVENTS = [
  OrderPlacedEvent,
  PaymentAuthorizedEvent,
  PaymentDeclinedEvent,
  PaymentCapturedEvent,
  OrderCompletedEvent,
  OrderFailedEvent,
] as const;
