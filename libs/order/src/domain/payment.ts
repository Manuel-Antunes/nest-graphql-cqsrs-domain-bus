import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '@nestjs/cqrs';
import { PaymentAuthorizedEvent, PaymentCapturedEvent, PaymentDeclinedEvent } from './event/order-event';
import { AUTHORIZATION_LIMIT } from './vo/money';

/** Onde um pagamento está — o estado que decide se `capture` faz alguma coisa. */
export enum PaymentStatus {
  AUTHORIZED = 'AUTHORIZED',
  DECLINED = 'DECLINED',
  CAPTURED = 'CAPTURED',
}

/**
 * O pagamento, do lado do serviço de pagamentos: autoriza (reserva o valor) e captura (cobra).
 * Mesma chave do pedido — os dois agregados são o mesmo fato visto de dois serviços, e é a `key`
 * que os amarra.
 *
 * A regra de autorização é deliberadamente determinística (`amount > AUTHORIZATION_LIMIT` recusa) em
 * vez de aleatória ou de uma chamada externa: é o que dá ao teste e2e um caminho feliz e um caminho
 * de recusa, os dois reproduzíveis.
 */
export class Payment extends AggregateRoot {
  key: string;
  orderId: string;
  amount: number;
  status: PaymentStatus;
  authorizationId?: string;
  receiptId?: string;

  static authorize(key: string, orderId: string, amount: number): Payment {
    const payment = new Payment();
    payment.apply(
      amount > AUTHORIZATION_LIMIT
        ? new PaymentDeclinedEvent(key, orderId, amount, `valor acima do limite de autorização (${AUTHORIZATION_LIMIT})`, new Date())
        : new PaymentAuthorizedEvent(key, orderId, randomUUID(), amount, new Date()),
    );
    return payment;
  }

  capture(): void {
    if (this.status !== PaymentStatus.AUTHORIZED) {
      return;
    }
    this.apply(new PaymentCapturedEvent(this.key, this.orderId, randomUUID(), this.amount, new Date()));
  }

  onPaymentAuthorizedEvent(event: PaymentAuthorizedEvent): void {
    this.key = event.key;
    this.orderId = event.orderId;
    this.amount = event.amount;
    this.authorizationId = event.authorizationId;
    this.status = PaymentStatus.AUTHORIZED;
  }

  onPaymentDeclinedEvent(event: PaymentDeclinedEvent): void {
    this.key = event.key;
    this.orderId = event.orderId;
    this.amount = event.amount;
    this.status = PaymentStatus.DECLINED;
  }

  onPaymentCapturedEvent(event: PaymentCapturedEvent): void {
    this.receiptId = event.receiptId;
    this.status = PaymentStatus.CAPTURED;
  }
}
