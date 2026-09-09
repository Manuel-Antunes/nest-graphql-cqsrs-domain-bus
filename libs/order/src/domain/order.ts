import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '@nestjs/cqrs';
import { z } from 'zod';
import { OrderStatus } from './order-step';
import {
  OrderCompletedEvent,
  OrderFailedEvent,
  OrderPlacedEvent,
} from './event/order-event';
import { InvalidOrderException } from './exception/order.exceptions';
import { OrderKey } from './vo/order-key';
import { Amount } from './vo/money';

/** O que é preciso para um pedido nascer — validado junto, num `safeParse` só. */
const NewOrder = z.object({
  key: OrderKey,
  orderId: z.uuid({ error: 'orderId precisa ser um UUID' }),
  amount: Amount,
  customer: z.string().trim().min(1, { error: 'customer não pode ser vazio' }),
});
export type NewOrder = z.input<typeof NewOrder>;

/**
 * O pedido, do lado da API: ele nasce quando o cliente pede e termina quando o pagamento volta —
 * capturado (completo) ou recusado (falho). O miolo do pagamento não é problema dele; é do
 * agregado `Payment`, no outro serviço.
 *
 * ## A chave é a identidade
 * Um `Order` **é** a sua `key` — a chave de idempotência que o cliente gerou. Não há id de
 * servidor, e é isso que faz a deduplicação cair fora do handler: pedir duas vezes o mesmo pedido é
 * pedir o mesmo agregado, e um agregado que já começou não começa de novo.
 *
 * ## Decidir e evoluir
 * Como no `Post`: `start`/`complete`/`fail` validam e chamam `apply(evento)`; os `on<Evento>`
 * aplicam o evento ao estado. `complete` e `fail` num pedido que já terminou são **no-ops**, e não
 * erros: numa saga coreografada uma mensagem pode chegar duas vezes, e a resposta certa a "isso já
 * aconteceu" é o silêncio, não uma exceção.
 */
export class Order extends AggregateRoot {
  key: string;
  orderId: string;
  amount: number;
  customer: string;
  status: OrderStatus = OrderStatus.PENDING;
  receiptId?: string;
  reason?: string;
  placedAt: Date;
  updatedAt: Date;

  static start(input: NewOrder): Order {
    const parsed = NewOrder.safeParse(input);
    if (!parsed.success) {
      throw InvalidOrderException.fromZod(parsed.error);
    }
    const { key, orderId, amount, customer } = parsed.data;
    const order = new Order();
    order.apply(new OrderPlacedEvent(key, orderId, amount, customer, new Date()));
    return order;
  }

  complete(receiptId: string): void {
    if (this.status !== OrderStatus.PENDING) {
      return;
    }
    this.apply(new OrderCompletedEvent(this.key, this.orderId, receiptId, new Date()));
  }

  fail(reason: string): void {
    if (this.status !== OrderStatus.PENDING) {
      return;
    }
    this.apply(new OrderFailedEvent(this.key, this.orderId, reason, new Date()));
  }

  onOrderPlacedEvent(event: OrderPlacedEvent): void {
    this.key = event.key;
    this.orderId = event.orderId;
    this.amount = event.amount;
    this.customer = event.customer;
    this.status = OrderStatus.PENDING;
    this.placedAt = event.occurredAt;
    this.updatedAt = event.occurredAt;
  }

  onOrderCompletedEvent(event: OrderCompletedEvent): void {
    this.status = OrderStatus.COMPLETED;
    this.receiptId = event.receiptId;
    this.updatedAt = event.occurredAt;
  }

  onOrderFailedEvent(event: OrderFailedEvent): void {
    this.status = OrderStatus.FAILED;
    this.reason = event.reason;
    this.updatedAt = event.occurredAt;
  }
}

/** Um id de pedido novo, para quando o cliente não traz o seu. */
export const newOrderId = (): string => randomUUID();
