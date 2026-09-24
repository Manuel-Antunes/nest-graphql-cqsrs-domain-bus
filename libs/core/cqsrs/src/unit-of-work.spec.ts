import { UnitOfWork } from './unit-of-work';

describe('a unit of work', () => {
  const trace: string[] = [];

  beforeEach(() => {
    trace.length = 0;
  });

  const record = (name: string) => () => {
    trace.push(name);
  };

  it('runs the phases in order, and only after the work is done', async () => {
    await UnitOfWork.run(async () => {
      const unit = UnitOfWork.current();
      unit?.on('afterCommit', record('afterCommit'));
      unit?.on('commit', record('commit'));
      unit?.on('prepareCommit', record('prepareCommit'));
      unit?.on('cleanup', record('cleanup'));
      trace.push('work');
    });

    expect(trace).toEqual([
      'work',
      'prepareCommit',
      'commit',
      'afterCommit',
      'cleanup',
    ]);
  });

  it('answers what the work answered', async () => {
    await expect(UnitOfWork.run(async () => 'done')).resolves.toBe('done');
  });

  it("does not commit work that failed: the events are discarded and the failure is the caller's", async () => {
    await expect(
      UnitOfWork.run(async () => {
        UnitOfWork.current()?.on('commit', record('commit'));
        UnitOfWork.current()?.on('rollback', record('rollback'));
        UnitOfWork.current()?.on('cleanup', record('cleanup'));
        throw new Error('the handler refused');
      }),
    ).rejects.toThrow('the handler refused');

    expect(trace).toEqual(['rollback', 'cleanup']);
  });

  it('commits despite tracked work that failed, which is the bus that dispatched it to report', async () => {
    await UnitOfWork.run(async () => {
      UnitOfWork.current()?.on('commit', record('commit'));
      void UnitOfWork.current()
        ?.track(Promise.reject(new Error('the saga command refused')))
        .catch(() => undefined);
    });

    expect(trace).toEqual(['commit']);
  });

  it('fails with the tracked work when its caller asked to be told', async () => {
    await expect(
      UnitOfWork.run(
        async () => {
          UnitOfWork.current()?.on('commit', record('commit'));
          UnitOfWork.current()?.on('rollback', record('rollback'));
          void UnitOfWork.current()
            ?.track(Promise.reject(new Error('the saga command refused')))
            .catch(() => undefined);
        },
        undefined,
        { failOnTrackedFailure: true },
      ),
    ).rejects.toThrow('the saga command refused');

    expect(trace).toEqual(['rollback']);
  });

  it('is joined, not nested: a command dispatched from inside one commits with it', async () => {
    await UnitOfWork.run(async () => {
      const outer = UnitOfWork.current();
      await UnitOfWork.run(async () => {
        expect(UnitOfWork.current()).toBe(outer);
        UnitOfWork.current()?.on('commit', record('inner'));
      });
      expect(trace).toEqual([]);
      UnitOfWork.current()?.on('commit', record('outer'));
    });

    expect(trace).toEqual(['inner', 'outer']);
  });

  it('prepares again for whatever was staged while preparing', async () => {
    await UnitOfWork.run(async () => {
      const unit = UnitOfWork.current();
      unit?.on('prepareCommit', () => {
        trace.push('first');
        unit.on('prepareCommit', record('second'));
      });
    });

    expect(trace).toEqual(['first', 'second']);
  });

  it('stops taking work once it is telling the world, so a reaction is new work', async () => {
    let stagingDuringCommit: boolean | undefined;

    await UnitOfWork.run(async () => {
      const unit = UnitOfWork.current();
      expect(unit?.staging).toBe(true);
      unit?.on('commit', () => {
        stagingDuringCommit = unit.staging;
      });
    });

    expect(stagingDuringCommit).toBe(false);
  });

  describe('the request is the scope', () => {
    it('joins a unit that belongs to the same request', async () => {
      const request = { correlationId: 'c-1' };

      await UnitOfWork.run(async () => {
        const outer = UnitOfWork.current();
        await UnitOfWork.run(async () => {
          expect(UnitOfWork.current()).toBe(outer);
          UnitOfWork.current()?.on('commit', record('inner'));
        }, request);
        expect(trace).toEqual([]);
      }, request);

      expect(trace).toEqual(['inner']);
    });

    it('does NOT join a unit that belongs to another request, and commits on its own', async () => {
      const mine = { correlationId: 'c-1' };
      const theirs = { correlationId: 'c-2' };

      await UnitOfWork.run(async () => {
        await UnitOfWork.run(async () => {
          UnitOfWork.current()?.on('commit', record('theirs'));
        }, theirs);
        expect(trace).toEqual(['theirs']);
        UnitOfWork.current()?.on('commit', record('mine'));
      }, mine);

      expect(trace).toEqual(['theirs', 'mine']);
    });

    it('shares the unit when either side names no request, so nothing starts one by accident', async () => {
      const request = { correlationId: 'c-1' };

      await UnitOfWork.run(async () => {
        const outer = UnitOfWork.current();
        await UnitOfWork.run(async () => {
          expect(UnitOfWork.current()).toBe(outer);
        });
      }, request);
    });

    it('carries the request it belongs to, the way Axon carries the message', async () => {
      const request = { correlationId: 'c-1' };

      await UnitOfWork.run(async () => {
        expect(UnitOfWork.current()?.request).toBe(request);
      }, request);
    });
  });

  it('refuses a listener that stages forever instead of hanging', async () => {
    await expect(
      UnitOfWork.run(async () => {
        const unit = UnitOfWork.current();
        const again = (): void => {
          unit?.on('prepareCommit', again);
        };
        unit?.on('prepareCommit', again);
      }),
    ).rejects.toThrow(/prepare rounds/);
  });

  it('is undefined outside one, which is how a publisher knows to send straight away', async () => {
    expect(UnitOfWork.current()).toBeUndefined();
    expect(UnitOfWork.isStarted()).toBe(false);
  });
});
