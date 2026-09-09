import { CqsrsModule } from '@app/cqsrs';
import { EventBus, type IEvent } from '@nestjs/cqrs';
import { Transport } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { MESSAGING_OPTIONS } from '../constants';
import { type EventEnvelope, EventRegistry } from '../event-registry';
import type { MessagingOptions } from '../messaging-options';
import { ExcludeLocal, TransportType } from './transport-type.decorator';
import { DURABLE_EVENT_PATTERN, EVENTS_DURABLE_CLIENT, EVENTS_NOTIFY_CLIENT, NOTIFICATION_EVENT_PATTERN } from './transport.constants';
import { TransportEventBus } from './transport-event-bus';

/** Sem decorator: não sai do processo. */
class StayedHome {
  constructor(readonly n: number) {}
}

/** Um aviso: difusão, e também aqui. */
@TransportType(Transport.REDIS)
class Announced {
  constructor(readonly n: number) {}
}

/** Moveu dinheiro: difusão para quem quer saber, e fila para quem não pode perder. */
@TransportType(Transport.REDIS, Transport.RMQ)
class MovedMoney {
  constructor(readonly n: number) {}
}

/** Só para os outros: não passa pelo barramento local. */
@TransportType(Transport.REDIS)
@ExcludeLocal()
class ForOthersOnly {
  constructor(readonly n: number) {}
}

/** Pede um transporte que este serviço não configurou. */
@TransportType(Transport.KAFKA)
class WrongTransport {
  constructor(readonly n: number) {}
}

class FakeClient {
  readonly emitted: { pattern: string; envelope: EventEnvelope }[] = [];

  emit(pattern: string, envelope: EventEnvelope) {
    this.emitted.push({ pattern, envelope });
    return of(undefined);
  }
}

/**
 * A ideia que veio do `nestjs-transport-eventbus`: **cada evento escolhe os seus transportes**.
 * Sem broker nenhum — os `ClientProxy` são dublês, e o que está sob teste é o roteamento.
 */
describe('TransportEventBus', () => {
  let module: TestingModule;
  let eventBus: EventBus;
  let notify: FakeClient;
  let durable: FakeClient;
  let local: IEvent[];

  const options: MessagingOptions = {
    service: 'api',
    events: [StayedHome, Announced, MovedMoney, ForOthersOnly, WrongTransport],
    clients: [],
    eventTransports: [
      { transport: Transport.REDIS, client: EVENTS_NOTIFY_CLIENT, pattern: NOTIFICATION_EVENT_PATTERN },
      { transport: Transport.RMQ, client: EVENTS_DURABLE_CLIENT, pattern: DURABLE_EVENT_PATTERN },
    ],
  };

  beforeEach(async () => {
    notify = new FakeClient();
    durable = new FakeClient();
    module = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [
        { provide: MESSAGING_OPTIONS, useValue: options },
        { provide: EVENTS_NOTIFY_CLIENT, useValue: notify },
        { provide: EVENTS_DURABLE_CLIENT, useValue: durable },
        EventRegistry,
        TransportEventBus,
      ],
    }).compile();
    await module.init();

    eventBus = module.get(EventBus);
    local = [];
    eventBus.subscribe((event) => local.push(event));
  });

  afterEach(async () => module.close());

  const patterns = (client: FakeClient) => client.emitted.map((e) => e.pattern);

  it('keeps an undecorated event inside the process — leaving the machine is a decision, not an accident', () => {
    eventBus.publish(new StayedHome(1));

    expect(patterns(notify)).toEqual([]);
    expect(patterns(durable)).toEqual([]);
    expect(local).toEqual([new StayedHome(1)]);
  });

  it('broadcasts an announcement and still publishes it locally', () => {
    eventBus.publish(new Announced(2));

    expect(patterns(notify)).toEqual([NOTIFICATION_EVENT_PATTERN]);
    expect(patterns(durable)).toEqual([]);
    expect(local).toEqual([new Announced(2)]);
  });

  it('sends the same event down two transports when it asks for both', () => {
    eventBus.publish(new MovedMoney(3));

    expect(patterns(notify)).toEqual([NOTIFICATION_EVENT_PATTERN]);
    expect(patterns(durable)).toEqual([DURABLE_EVENT_PATTERN]);
    expect(local).toEqual([new MovedMoney(3)]);
    // um fato só, dois envelopes idênticos: quem os consome é que é diferente
    expect(notify.emitted[0].envelope).toEqual(durable.emitted[0].envelope);
  });

  it('skips the local bus when the event says it is only for the others', () => {
    eventBus.publish(new ForOthersOnly(4));

    expect(patterns(notify)).toEqual([NOTIFICATION_EVENT_PATTERN]);
    expect(local).toEqual([]);
  });

  it('stamps the origin and the class name on the envelope, which is what lets the other side rebuild it', () => {
    eventBus.publish(new Announced(5));

    expect(notify.emitted[0].envelope).toEqual({ origin: 'api', name: 'Announced', payload: { n: 5 } });
  });

  it('ignores a transport this service did not configure, without losing the local publish', () => {
    eventBus.publish(new WrongTransport(6));

    expect(patterns(notify)).toEqual([]);
    expect(local).toEqual([new WrongTransport(6)]);
  });
});
