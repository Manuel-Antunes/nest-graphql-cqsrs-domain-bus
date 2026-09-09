import {
  type Order,
  type OrderEvent,
  OrderCompletedEvent,
  OrderFailedEvent,
  OrderPlacedEvent,
  PaymentAuthorizedEvent,
  PaymentCapturedEvent,
  PaymentDeclinedEvent,
  type PaymentSnapshot,
} from '@app/order';
import { Injectable } from '@nestjs/common';
import { OrderUpdateView, OrderView, PaymentView } from '../dto/graphql/order.dto';

/** Domínio → protocolo, como o `PostViewMapper`: o agregado e os eventos viram as views do schema. */
@Injectable()
export class OrderViewMapper {
  fromOrder(order: Order): OrderView {
    return Object.assign(new OrderView(), {
      key: order.key,
      orderId: order.orderId,
      amount: order.amount,
      customer: order.customer,
      status: order.status,
      reason: order.reason ?? null,
      placedAt: order.placedAt,
      updatedAt: order.updatedAt,
    });
  }

  /** A projeção do pagamento → o tipo `Payment` do schema. */
  fromPayment(snapshot: PaymentSnapshot): PaymentView {
    return Object.assign(new PaymentView(), {
      status: snapshot.status,
      amount: snapshot.amount,
      authorizationId: snapshot.authorizationId ?? null,
      receiptId: snapshot.receiptId ?? null,
      reason: snapshot.reason ?? null,
      updatedAt: snapshot.updatedAt,
    });
  }

  /** O `detail` é o que cada passo trouxe de novo — o que muda entre os seis eventos. */
  fromEvent(event: OrderEvent): OrderUpdateView {
    return Object.assign(new OrderUpdateView(), {
      key: event.key,
      orderId: event.orderId,
      step: event.step,
      detail: OrderViewMapper.detailOf(event),
      occurredAt: event.occurredAt,
    });
  }

  private static detailOf(event: OrderEvent): string | null {
    if (event instanceof OrderPlacedEvent) return `${event.customer} · ${event.amount}`;
    if (event instanceof PaymentAuthorizedEvent) return event.authorizationId;
    if (event instanceof PaymentCapturedEvent) return event.receiptId;
    if (event instanceof OrderCompletedEvent) return event.receiptId;
    if (event instanceof PaymentDeclinedEvent || event instanceof OrderFailedEvent) return event.reason;
    return null;
  }
}
