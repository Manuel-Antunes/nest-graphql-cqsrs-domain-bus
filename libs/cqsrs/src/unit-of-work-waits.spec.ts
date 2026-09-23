import { Injectable } from '@nestjs/common';
import type { ICommandHandler, IEvent, IEventHandler } from '@nestjs/cqrs';
import {
  CommandBus,
  CommandHandler,
  EventBus,
  EventsHandler,
  ofType,
  Saga,
} from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { CqsrsModule } from './cqsrs.module';

class Start {}

class Finish {}

class Started {}

const done: string[] = [];

const afterATick = () => new Promise((resolve) => setTimeout(resolve, 20));

@CommandHandler(Start)
class StartHandler implements ICommandHandler<Start> {
  constructor(private readonly eventBus: EventBus) {}

  async execute(): Promise<void> {
    this.eventBus.publish(new Started());
  }
}

@CommandHandler(Finish)
class FinishHandler implements ICommandHandler<Finish> {
  async execute(): Promise<void> {
    await afterATick();
    done.push('the command the saga dispatched');
  }
}

@EventsHandler(Started)
@Injectable()
class SlowProjection implements IEventHandler<Started> {
  async handle(): Promise<void> {
    await afterATick();
    done.push('the projection');
  }
}

@Injectable()
class Sagas {
  @Saga()
  onStarted = (events$: Observable<IEvent>) =>
    events$.pipe(
      ofType(Started),
      map(() => new Finish()),
    );
}

describe('a unit of work waits for what the publish set off', () => {
  let module: TestingModule;
  let commands: CommandBus;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [StartHandler, FinishHandler, SlowProjection, Sagas],
    }).compile();
    await module.init();
    commands = module.get(CommandBus);
  });

  afterAll(() => module.close());

  beforeEach(() => {
    done.length = 0;
  });

  it('waits for a projection, so a frozen container cannot cut it in half', async () => {
    await commands.execute(new Start());

    expect(done).toContain('the projection');
  });

  it('waits for the command a saga dispatched, which is the one that broke on Lambda', async () => {
    await commands.execute(new Start());

    expect(done).toContain('the command the saga dispatched');
  });
});
