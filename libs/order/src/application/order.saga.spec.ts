import { EnqueueCommand } from '@app/messaging';
import { firstValueFrom, of } from 'rxjs';
import {
  OrderPlacedEvent,
  PaymentAuthorizedEvent,
  PaymentCapturedEvent,
  PaymentDeclinedEvent,
} from '../domain/event/order-event';
import { API_SERVICE, OrderPattern, PAYMENTS_SERVICE } from './order-routes';
import { OrderSaga } from './order.saga';

/**
 * A saga é uma função `Observable → Observable`: alimenta-se um evento e colhe-se o command. Nenhum
 * broker, nenhum módulo — as quatro regras da coreografia, lidas uma a uma.
 */
describe('OrderSaga', () => {
  const saga = new OrderSaga();
  const at = new Date('2026-09-08T12:00:00.000Z');

  it('asks payments to authorize when a order starts', async () => {
    const command = await firstValueFrom(saga.authorizeOnOrderStarted(of(new OrderPlacedEvent('k', 'o', 4990, 'manuel', at))));

    expect(command).toEqual(new EnqueueCommand(PAYMENTS_SERVICE, OrderPattern.AUTHORIZE, { key: 'k', orderId: 'o', amount: 4990 }));
  });

  it('asks payments to capture once it is authorized', async () => {
    const command = await firstValueFrom(saga.captureOnPaymentAuthorized(of(new PaymentAuthorizedEvent('k', 'o', 'auth-1', 4990, at))));

    expect(command).toEqual(new EnqueueCommand(PAYMENTS_SERVICE, OrderPattern.CAPTURE, { key: 'k' }));
  });

  it('tells the api the order is paid once it is captured', async () => {
    const command = await firstValueFrom(saga.completeOnPaymentCaptured(of(new PaymentCapturedEvent('k', 'o', 'receipt-1', 4990, at))));

    expect(command).toEqual(new EnqueueCommand(API_SERVICE, OrderPattern.COMPLETE, { key: 'k', receiptId: 'receipt-1' }));
  });

  it('tells the api it failed when the acquirer declines', async () => {
    const command = await firstValueFrom(saga.failOnPaymentDeclined(of(new PaymentDeclinedEvent('k', 'o', 4990, 'sem limite', at))));

    expect(command).toEqual(new EnqueueCommand(API_SERVICE, OrderPattern.FAIL, { key: 'k', reason: 'sem limite' }));
  });

  it('carries the key on every hop — it is what ties the two services to one order', async () => {
    const commands = await Promise.all([
      firstValueFrom(saga.authorizeOnOrderStarted(of(new OrderPlacedEvent('k', 'o', 1, 'c', at)))),
      firstValueFrom(saga.captureOnPaymentAuthorized(of(new PaymentAuthorizedEvent('k', 'o', 'a', 1, at)))),
      firstValueFrom(saga.completeOnPaymentCaptured(of(new PaymentCapturedEvent('k', 'o', 'r', 1, at)))),
      firstValueFrom(saga.failOnPaymentDeclined(of(new PaymentDeclinedEvent('k', 'o', 1, 'x', at)))),
    ]);

    expect(commands.map((command) => (command as EnqueueCommand).payload.key)).toEqual(['k', 'k', 'k', 'k']);
  });
});
