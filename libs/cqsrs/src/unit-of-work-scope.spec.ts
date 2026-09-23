import type { IEvent } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { EventBus, ofType, Saga } from '@nestjs/cqrs';
import { map } from 'rxjs';

import { UnitOfWork } from './unit-of-work';

class SomethingHappened {
  constructor(readonly id: string) {}
}

describe('what a publisher’s unit of work reaches', () => {
  const busOf = () =>
    new EventBus(
      { execute: () => Promise.resolve() } as never,
      {} as never,
      { publish: () => undefined } as never,
    );

  it('reaches an @EventsHandler, which is what lets one register its work', async () => {
    const bus = busOf();
    let seen: UnitOfWork | undefined;
    let outside = true;

    const handler = {
      instance: {
        handle: () => {
          seen = UnitOfWork.current();
          outside = false;
          return Promise.resolve();
        },
      },
      metatype: class {},
      isDependencyTreeStatic: () => true,
    };
    bus.bind(handler as never, '');

    await UnitOfWork.run(async () => {
      bus.publish(new SomethingHappened('a'));
      expect(seen).toBe(UnitOfWork.current());
    });

    expect(outside).toBe(false);
    expect(seen).toBeDefined();
  });

  it('reaches a saga’s dispatch, which is the one that breaks a Lambda when it does not', async () => {
    const executed: (UnitOfWork | undefined)[] = [];
    const bus = new EventBus(
      {
        execute: () => {
          executed.push(UnitOfWork.current());
          return Promise.resolve();
        },
      } as never,
      {} as never,
      { publish: () => undefined } as never,
    );

    class Sagas {
      @Saga()
      onSomething = (events$: Observable<IEvent>) =>
        events$.pipe(
          ofType(SomethingHappened),
          map(() => ({ dispatched: true })),
        );
    }
    bus.registerSagas([
      {
        metatype: Sagas,
        instance: new Sagas(),
        isDependencyTreeStatic: () => true,
      } as never,
    ]);

    let unit: UnitOfWork | undefined;
    await UnitOfWork.run(async () => {
      unit = UnitOfWork.current();
      bus.publish(new SomethingHappened('b'));
    });

    expect(executed).toEqual([unit]);
  });
});
