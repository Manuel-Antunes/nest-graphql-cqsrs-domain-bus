import { CommandHandler, EventBus, type ICommand, type ICommandHandler, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { map, type Observable } from 'rxjs';
import { Subscription } from './classes/subscription';
import { CqsrsModule } from './cqsrs.module';
import { SubscriptionHandler } from './decorators/subscription-handler.decorator';
import { EventStream } from './event-stream';
import type { ISubscriptionHandler } from './interfaces';
import { RemoteEventBus } from './remote-event-bus';
import { SubscriptionBus } from './subscription-bus';

class SomethingHappened {
  constructor(readonly id: string) {}
}
class ReactToIt implements ICommand {
  constructor(readonly id: string) {}
}

/** O que a saga de fato mandou executar — o que prova que ela disparou, e quantas vezes. */
const executed: string[] = [];

@CommandHandler(ReactToIt)
class ReactToItHandler implements ICommandHandler<ReactToIt> {
  async execute(command: ReactToIt): Promise<void> {
    executed.push(command.id);
  }
}

/** Uma saga como a que duas aplicações compartilhariam por uma lib. */
@Injectable()
class SharedSaga {
  @Saga()
  react = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(SomethingHappened),
      map((event) => new ReactToIt(event.id)),
    );
}

class OnSomething extends Subscription<SomethingHappened> {}

@SubscriptionHandler(OnSomething)
class OnSomethingHandler implements ISubscriptionHandler<OnSomething> {
  constructor(private readonly events: EventStream) {}

  subscribe(): Observable<SomethingHappened> {
    return this.events.pipe(ofType(SomethingHappened));
  }
}

/**
 * A invariante que segura o sistema distribuído inteiro: **um evento remoto notifica, mas não
 * dispara.** Sem Redis nem broker nenhum — o `RemoteEventBus` é a fronteira, e é ela que está sob
 * teste.
 */
describe('EventStream + RemoteEventBus', () => {
  let module: TestingModule;
  let eventBus: EventBus;
  let remote: RemoteEventBus;
  let seenBySubscription: SomethingHappened[];
  let stop: () => void;
  /** A saga executa o command de forma assíncrona; um tick não basta. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [SharedSaga, OnSomethingHandler, ReactToItHandler],
    }).compile();
    await module.init();

    eventBus = module.get(EventBus);
    remote = module.get(RemoteEventBus);
    executed.length = 0;
    seenBySubscription = [];
    const subscription = module
      .get(SubscriptionBus)
      .subscribe(new OnSomething())
      .subscribe((event) => seenBySubscription.push(event));
    stop = () => subscription.unsubscribe();
  });

  afterEach(async () => {
    stop();
    await module.close();
  });

  it('a local event both notifies the subscription and triggers the saga', async () => {
    eventBus.publish(new SomethingHappened('local'));
    await settle();

    expect(seenBySubscription.map((event) => event.id)).toEqual(['local']);
    expect(executed).toEqual(['local']);
  });

  it('a remote event only notifies the subscription — the shared saga does not fire again', async () => {
    remote.publish(new SomethingHappened('remote'));
    await settle();

    expect(seenBySubscription.map((event) => event.id)).toEqual(['remote']);
    // é isto que impede o outro serviço de reagir de novo ao que já foi tratado no dono do fato
    expect(executed).toEqual([]);
  });

  it('the subscription sees both, in the order they arrived, without knowing which is which', async () => {
    eventBus.publish(new SomethingHappened('daqui'));
    remote.publish(new SomethingHappened('de lá'));
    eventBus.publish(new SomethingHappened('daqui de novo'));
    await settle();

    expect(seenBySubscription.map((event) => event.id)).toEqual(['daqui', 'de lá', 'daqui de novo']);
    expect(executed).toEqual(['daqui', 'daqui de novo']); // o remoto não virou command
  });
});
