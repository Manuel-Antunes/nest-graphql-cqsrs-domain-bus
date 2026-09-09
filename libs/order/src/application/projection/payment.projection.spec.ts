import { CqsrsModule, RemoteEventBus } from '@app/cqsrs';
import { EventBus } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PaymentAuthorizedEvent, PaymentCapturedEvent, PaymentDeclinedEvent } from '../../domain/event/order-event';
import { PaymentStatus } from '../../domain/payment';
import { PaymentProjection } from './payment.projection';

/**
 * A projeção é o read model que a API constrói dos eventos do **outro** serviço. O teste entrega
 * esses eventos pelo `RemoteEventBus` — que é por onde eles chegam de verdade — para provar que ela
 * não depende do `EventBus` local.
 */
describe('PaymentProjection', () => {
  let module: TestingModule;
  let projection: PaymentProjection;
  let remote: RemoteEventBus;
  const at = (minute: number) => new Date(`2026-09-08T12:0${minute}:00.000Z`);

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [PaymentProjection],
    }).compile();
    await module.init();
    projection = module.get(PaymentProjection);
    remote = module.get(RemoteEventBus);
  });

  afterEach(async () => module.close());

  it('knows nothing about an order whose payment has not answered yet', () => {
    expect(projection.find('k')).toBeUndefined();
  });

  it('builds the payment from events that happened in another service', () => {
    remote.publish(new PaymentAuthorizedEvent('k', 'o', 'auth-1', 4990, at(1)));

    expect(projection.find('k')).toEqual({
      orderKey: 'k',
      orderId: 'o',
      status: PaymentStatus.AUTHORIZED,
      amount: 4990,
      authorizationId: 'auth-1',
      updatedAt: at(1),
    });
  });

  it('keeps the authorization id through the capture — it is the one thing the capture does not repeat', () => {
    remote.publish(new PaymentAuthorizedEvent('k', 'o', 'auth-1', 4990, at(1)));
    remote.publish(new PaymentCapturedEvent('k', 'o', 'receipt-1', 4990, at(2)));

    expect(projection.find('k')).toMatchObject({
      status: PaymentStatus.CAPTURED,
      authorizationId: 'auth-1',
      receiptId: 'receipt-1',
      updatedAt: at(2),
    });
  });

  it('records a decline with its reason and the amount that was refused', () => {
    remote.publish(new PaymentDeclinedEvent('k', 'o', 250_000, 'acima do limite', at(1)));

    expect(projection.find('k')).toMatchObject({
      status: PaymentStatus.DECLINED,
      amount: 250_000,
      reason: 'acima do limite',
    });
  });

  it('keeps one payment per order key', () => {
    remote.publish(new PaymentAuthorizedEvent('k1', 'o1', 'auth-1', 100, at(1)));
    remote.publish(new PaymentAuthorizedEvent('k2', 'o2', 'auth-2', 200, at(2)));

    expect(projection.find('k1')).toMatchObject({ authorizationId: 'auth-1', amount: 100 });
    expect(projection.find('k2')).toMatchObject({ authorizationId: 'auth-2', amount: 200 });
  });

  it('also sees a payment that happened locally — the stream is local plus remote', () => {
    module.get(EventBus).publish(new PaymentAuthorizedEvent('k', 'o', 'auth-local', 700, at(1)));

    expect(projection.find('k')).toMatchObject({ authorizationId: 'auth-local' });
  });
});
