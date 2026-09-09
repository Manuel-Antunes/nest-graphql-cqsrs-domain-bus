import { Order } from './order';
import { OrderStatus } from './order-step';
import { OrderCompletedEvent, OrderFailedEvent, OrderPlacedEvent, PaymentDeclinedEvent } from './event/order-event';
import { InvalidOrderException } from './exception/order.exceptions';
import { Payment, PaymentStatus } from './payment';
import { newOrderKey } from './vo/order-key';

describe('Order', () => {
  const start = (amount = 4990) =>
    Order.start({ key: newOrderKey(), orderId: crypto.randomUUID(), amount, customer: 'manuel' });

  it('is born pending and raises the event that starts the whole choreography', () => {
    const order = start();

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.getUncommittedEvents()).toEqual([expect.any(OrderPlacedEvent)]);
  });

  it.each([
    ['a malformed key', { key: 'nao-e-uuid', orderId: crypto.randomUUID(), amount: 1, customer: 'c' }],
    ['a zero amount', { key: newOrderKey(), orderId: crypto.randomUUID(), amount: 0, customer: 'c' }],
    ['a blank customer', { key: newOrderKey(), orderId: crypto.randomUUID(), amount: 1, customer: '  ' }],
    ['a fractional amount', { key: newOrderKey(), orderId: crypto.randomUUID(), amount: 4.9, customer: 'c' }],
  ])('refuses %s', (_case, input) => {
    expect(() => Order.start(input)).toThrow(InvalidOrderException);
  });

  it('completes with the receipt', () => {
    const order = start();
    order.complete('receipt-1');

    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(order.receiptId).toBe('receipt-1');
    expect(order.getUncommittedEvents().at(-1)).toBeInstanceOf(OrderCompletedEvent);
  });

  it('fails with the reason', () => {
    const order = start();
    order.fail('sem limite');

    expect(order.status).toBe(OrderStatus.FAILED);
    expect(order.reason).toBe('sem limite');
    expect(order.getUncommittedEvents().at(-1)).toBeInstanceOf(OrderFailedEvent);
  });

  it('stays silent when the same outcome arrives twice — a queue can deliver a message again', () => {
    const order = start();
    order.complete('receipt-1');
    order.complete('receipt-2');
    order.fail('tarde demais');

    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(order.receiptId).toBe('receipt-1');
    expect(order.getUncommittedEvents()).toHaveLength(2); // started + completed, e nada mais
  });
});

describe('Payment', () => {
  it('authorizes what is within the limit', () => {
    const payment = Payment.authorize('k', 'o', 4990);

    expect(payment.status).toBe(PaymentStatus.AUTHORIZED);
    expect(payment.authorizationId).toEqual(expect.any(String));
  });

  it('declines what is above it, and says why', () => {
    const payment = Payment.authorize('k', 'o', 250_000);

    expect(payment.status).toBe(PaymentStatus.DECLINED);
    expect(payment.getUncommittedEvents().at(-1)).toBeInstanceOf(PaymentDeclinedEvent);
    expect((payment.getUncommittedEvents().at(-1) as PaymentDeclinedEvent).reason).toMatch(/limite de autorização/);
  });

  it('captures only what was authorized, and only once', () => {
    const declined = Payment.authorize('k', 'o', 250_000);
    declined.capture();
    expect(declined.status).toBe(PaymentStatus.DECLINED);

    const payment = Payment.authorize('k', 'o', 4990);
    payment.capture();
    payment.capture();

    expect(payment.status).toBe(PaymentStatus.CAPTURED);
    expect(payment.getUncommittedEvents()).toHaveLength(2); // authorized + captured
  });
});
