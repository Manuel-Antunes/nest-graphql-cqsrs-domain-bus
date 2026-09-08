import { EventBus, ofType } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Observable } from 'rxjs';
import { Subscription } from './classes/subscription';
import { CqsrsModule } from './cqsrs.module';
import { SubscriptionHandler } from './decorators/subscription-handler.decorator';
import { SubscriptionHandlerNotFoundException } from './exceptions';
import type { ISubscriptionHandler } from './interfaces';
import { SubscriptionBus } from './subscription-bus';

class CounterEvent {
  constructor(
    readonly topic: string,
    readonly value: number,
  ) {}
}

/** Uma subscription com critério: o filtro por tópico, escrito ao lado da mensagem. */
class OnCounterSubscription extends Subscription<CounterEvent, { topic?: string | null }> {
  override filter(event: CounterEvent): boolean {
    return !this.criteria.topic || event.topic === this.criteria.topic;
  }
}

/** Nenhum `@SubscriptionHandler` aponta para ela — nem metadata ela tem. */
class UnhandledSubscription extends Subscription<CounterEvent> {}

@SubscriptionHandler(OnCounterSubscription)
class OnCounterSubscriptionHandler implements ISubscriptionHandler<OnCounterSubscription> {
  /** Quantas vezes a fonte foi aberta — uma vez por *stream*, não por assinante. */
  static opened = 0;

  constructor(private readonly eventBus: EventBus) {}

  subscribe(): Observable<CounterEvent> {
    OnCounterSubscriptionHandler.opened += 1;
    return this.eventBus.pipe(ofType(CounterEvent));
  }
}

describe('SubscriptionBus', () => {
  let module: TestingModule;
  let bus: SubscriptionBus;
  let eventBus: EventBus;
  /** Assinantes do `EventBus` — é o número que diz se o bus compartilhou ou duplicou o stream. */
  const upstream = () => eventBus.subject$.observers.length;
  const active: { unsubscribe(): void }[] = [];

  /** Assina um stream e devolve o que ele entregar; a inscrição é cancelada no fim do teste. */
  const collect = <T>(stream: Observable<T>) => {
    const received: T[] = [];
    const subscription = stream.subscribe((value) => received.push(value));
    active.push(subscription);
    return { received, stop: () => subscription.unsubscribe() };
  };
  const values = ({ received }: { received: CounterEvent[] }) => received.map((event) => event.value);

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [OnCounterSubscriptionHandler],
    }).compile();
    await module.init();
    bus = module.get(SubscriptionBus);
    eventBus = module.get(EventBus);
  });

  afterEach(() => active.splice(0).forEach((subscription) => subscription.unsubscribe()));
  afterAll(async () => module.close());

  it('routes the message to its @SubscriptionHandler and streams what the handler wired up', () => {
    const all = collect(bus.subscribe(new OnCounterSubscription({})));

    eventBus.publish(new CounterEvent('a', 1));
    eventBus.publish(new CounterEvent('b', 2));

    expect(values(all)).toEqual([1, 2]);
  });

  it('applies the filter of the message itself, so each subscriber only sees its own criteria', () => {
    const onlyA = collect(bus.subscribe(new OnCounterSubscription({ topic: 'a' })));
    const all = collect(bus.subscribe(new OnCounterSubscription({})));

    eventBus.publish(new CounterEvent('a', 1));
    eventBus.publish(new CounterEvent('b', 2));

    expect(values(onlyA)).toEqual([1]);
    expect(values(all)).toEqual([1, 2]);
  });

  it('gives one stream to the same criteria: two subscribers, one subscription upstream', () => {
    const before = upstream();
    const opened = OnCounterSubscriptionHandler.opened;
    const first = bus.subscribe(new OnCounterSubscription({ topic: 'shared' }));
    const second = bus.subscribe(new OnCounterSubscription({ topic: 'shared' }));
    expect(second).toBe(first);

    const a = collect(first);
    const b = collect(second);
    eventBus.publish(new CounterEvent('shared', 7));

    expect(upstream()).toBe(before + 1);
    expect(OnCounterSubscriptionHandler.opened).toBe(opened + 1);
    expect(values(a)).toEqual([7]);
    expect(values(b)).toEqual([7]);
  });

  it('gives different criteria different streams, each with its own subscription upstream', () => {
    const before = upstream();
    const onlyA = bus.subscribe(new OnCounterSubscription({ topic: 'a' }));
    const onlyB = bus.subscribe(new OnCounterSubscription({ topic: 'b' }));

    expect(onlyB).not.toBe(onlyA);
    collect(onlyA);
    collect(onlyB);
    expect(upstream()).toBe(before + 2);
  });

  it('treats an absent criterion and an undefined one as the same request', () => {
    expect(bus.subscribe(new OnCounterSubscription({}))).toBe(bus.subscribe(new OnCounterSubscription({ topic: undefined })));
  });

  it('closes the upstream when the last subscriber leaves, and opens it again on demand', () => {
    const before = upstream();
    const stream = bus.subscribe(new OnCounterSubscription({ topic: 'lifecycle' }));
    const a = collect(stream);
    const b = collect(stream);
    expect(upstream()).toBe(before + 1);

    a.stop();
    expect(upstream()).toBe(before + 1);
    b.stop();
    expect(upstream()).toBe(before);

    const again = collect(stream);
    expect(upstream()).toBe(before + 1);
    eventBus.publish(new CounterEvent('lifecycle', 9));

    expect(values(again)).toEqual([9]);
    // e o bus voltou a reconhecer esse stream como o do critério — não abriu um segundo em paralelo
    expect(bus.subscribe(new OnCounterSubscription({ topic: 'lifecycle' }))).toBe(stream);
    expect(upstream()).toBe(before + 1);
  });

  it('throws when no @SubscriptionHandler handles the message', () => {
    expect(() => bus.subscribe(new UnhandledSubscription())).toThrow(SubscriptionHandlerNotFoundException);
  });

  it('announces every subscribe on subscriptions$, reused stream or not', () => {
    const asked: unknown[] = [];
    const watching = bus.subscriptions$.subscribe((subscription) => asked.push(subscription));
    const first = new OnCounterSubscription({ topic: 'announced' });
    const second = new OnCounterSubscription({ topic: 'announced' });

    collect(bus.subscribe(first));
    collect(bus.subscribe(second));

    expect(asked).toEqual([first, second]);
    watching.unsubscribe();
  });
});
