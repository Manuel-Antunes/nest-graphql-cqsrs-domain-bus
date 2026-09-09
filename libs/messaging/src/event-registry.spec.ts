import { EventRegistry } from './event-registry';

class OrderShipped {
  constructor(
    readonly orderId: string,
    readonly at: Date,
    readonly items: string[],
  ) {}
}
class NobodyKnowsThis {
  constructor(readonly x: number) {}
}

describe('EventRegistry', () => {
  const registry = new EventRegistry().register(OrderShipped);
  const shipped = new OrderShipped('order-1', new Date('2026-09-08T12:00:00.000Z'), ['a', 'b']);
  /** A viagem de verdade: o transporte serializa e desserializa o envelope como JSON. */
  const overTheWire = (origin: string) => JSON.parse(JSON.stringify(registry.envelope(shipped, origin)));

  it('rebuilds the event as an instance of its class, so instanceof and ofType still work', () => {
    const received = registry.restore(overTheWire('api'));

    expect(received).toBeInstanceOf(OrderShipped);
    expect(received).toEqual(shipped);
  });

  it('carries the origin, which is how a service discards its own echo', () => {
    expect(registry.envelope(shipped, 'payments').origin).toBe('payments');
  });

  it('brings dates back as Date, not as the string JSON turned them into', () => {
    const event = registry.restore(overTheWire('api'))!;

    expect((event as OrderShipped).at).toBeInstanceOf(Date);
    expect((event as OrderShipped).at.toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });

  it('keeps arrays as arrays', () => {
    expect((registry.restore(overTheWire('api'))! as OrderShipped).items).toEqual(['a', 'b']);
  });

  it('ignores an event type this service does not know — not every service knows every event', () => {
    const foreign = new EventRegistry().register(NobodyKnowsThis).envelope(new NobodyKnowsThis(1), 'other');

    expect(registry.restore(foreign)).toBeUndefined();
  });
});
