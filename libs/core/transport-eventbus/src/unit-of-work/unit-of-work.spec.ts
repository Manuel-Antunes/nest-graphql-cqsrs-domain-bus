import { DefaultPhases } from './phase';
import { ProcessingContext } from './processing-context';
import { ResourceKey } from './resource-key';
import { UnitOfWork } from './unit-of-work';

describe('a unit of work, as Axon 5 runs one', () => {
  const trace: string[] = [];

  beforeEach(() => {
    trace.length = 0;
  });

  const record = (name: string) => () => {
    trace.push(name);
  };

  it('runs its phases in order, whatever order they were registered in', async () => {
    const unit = new UnitOfWork();
    unit.onAfterCommit(record('AFTER_COMMIT'));
    unit.onCommit(record('COMMIT'));
    unit.onPrepareCommit(record('PREPARE_COMMIT'));
    unit.onPostInvocation(record('POST_INVOCATION'));
    unit.onInvocation(record('INVOCATION'));
    unit.onPreInvocation(record('PRE_INVOCATION'));

    await unit.execute();

    expect(trace).toEqual([
      'PRE_INVOCATION',
      'INVOCATION',
      'POST_INVOCATION',
      'PREPARE_COMMIT',
      'COMMIT',
      'AFTER_COMMIT',
    ]);
  });

  it('runs a phase of its own between two of the defaults', async () => {
    const unit = new UnitOfWork();
    unit.onCommit(record('COMMIT'));
    unit.on({ name: 'audit', order: 25000 }, record('audit'));
    unit.onPrepareCommit(record('PREPARE_COMMIT'));

    await unit.execute();

    expect(trace).toEqual(['PREPARE_COMMIT', 'audit', 'COMMIT']);
  });

  it('answers what the invocation answered, once the unit committed', async () => {
    const unit = new UnitOfWork();
    unit.onAfterCommit(record('AFTER_COMMIT'));

    await expect(unit.executeWithResult(async () => 'done')).resolves.toBe(
      'done',
    );
    expect(trace).toEqual(['AFTER_COMMIT']);
  });

  it('takes an action for a later phase while it runs, and refuses one for the phase it is in', async () => {
    const unit = new UnitOfWork();
    let refused: unknown;
    unit.onInvocation((context) => {
      context.onAfterCommit(record('registered during INVOCATION'));
      try {
        context.onInvocation(record('never'));
      } catch (error) {
        refused = error;
      }
    });

    await unit.execute();

    expect(trace).toEqual(['registered during INVOCATION']);
    expect((refused as Error).message).toMatch(
      /cannot run an action in INVOCATION: it is already in INVOCATION/,
    );
  });

  it('runs once: a second execute is refused', async () => {
    const unit = new UnitOfWork();
    await unit.execute();

    await expect(unit.execute()).rejects.toThrow(
      /cannot be committed \(again\)/,
    );
  });

  it('finishes the phase that failed, skips every later one, and tells the error actions which phase it was', async () => {
    const unit = new UnitOfWork();
    const failures: string[] = [];
    unit.onPrepareCommit(() => {
      throw new Error('the append was refused');
    });
    unit.onPrepareCommit(record('the rest of PREPARE_COMMIT'));
    unit.onCommit(record('COMMIT'));
    unit.whenComplete(record('whenComplete'));
    unit.onError((_context, phase, error) => {
      failures.push(`${phase.name}: ${(error as Error).message}`);
    });
    unit.doFinally(record('doFinally'));

    await expect(unit.execute()).rejects.toThrow('the append was refused');

    expect(trace).toEqual(['the rest of PREPARE_COMMIT', 'doFinally']);
    expect(failures).toEqual(['PREPARE_COMMIT: the append was refused']);
    expect(unit.isError()).toBe(true);
    expect(unit.isCommitted()).toBe(false);
  });

  it('keeps the first failure of a phase and the others as suppressed', async () => {
    const unit = new UnitOfWork();
    unit.onPrepareCommit(() => Promise.reject(new Error('first')));
    unit.onPrepareCommit(() => Promise.reject(new Error('second')));

    const failure = await unit.execute().catch((error: unknown) => error);

    expect((failure as Error).message).toBe('first');
    expect(
      (failure as { suppressed?: Error[] }).suppressed?.map(
        (error) => error.message,
      ),
    ).toEqual(['second']);
  });

  it('never lets an error or a completion action change the outcome', async () => {
    const committed = new UnitOfWork();
    committed.whenComplete(() => {
      throw new Error('a completion action failed');
    });
    await expect(committed.execute()).resolves.toBeUndefined();

    const failed = new UnitOfWork();
    failed.onInvocation(() => {
      throw new Error('the handler failed');
    });
    failed.onError(() => {
      throw new Error('an error action failed too');
    });
    await expect(failed.execute()).rejects.toThrow('the handler failed');
  });

  it('runs an error or completion action registered too late at once', async () => {
    const unit = new UnitOfWork();
    await unit.execute();

    unit.whenComplete(record('late completion'));
    await Promise.resolve();

    expect(trace).toEqual(['late completion']);
  });

  it('says it committed only once every phase ran', async () => {
    const unit = new UnitOfWork();
    const seen: boolean[] = [];
    unit.onAfterCommit((context) => {
      seen.push(context.isCommitted());
    });

    await unit.execute();

    expect(seen).toEqual([false]);
    expect(unit.isCommitted()).toBe(true);
  });

  it('starts every action of a phase before any finishes, unless it is told to run them one at a time', async () => {
    const concurrent = new UnitOfWork();
    const sequential = new UnitOfWork({ sequential: true });
    for (const [unit, name] of [
      [concurrent, 'concurrent'],
      [sequential, 'sequential'],
    ] as const) {
      for (const action of ['a', 'b']) {
        unit.onInvocation(async () => {
          trace.push(`${name} ${action} starts`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          trace.push(`${name} ${action} ends`);
        });
      }
    }

    await concurrent.execute();
    await sequential.execute();

    expect(trace).toEqual([
      'concurrent a starts',
      'concurrent b starts',
      'concurrent a ends',
      'concurrent b ends',
      'sequential a starts',
      'sequential a ends',
      'sequential b starts',
      'sequential b ends',
    ]);
  });

  it('wraps every action with its interceptors, the first outermost', async () => {
    const unit = new UnitOfWork({
      interceptors: [
        (action) => async (context) => {
          trace.push('outer in');
          await action(context);
          trace.push('outer out');
        },
        (action) => async (context) => {
          trace.push('inner in');
          await action(context);
          trace.push('inner out');
        },
      ],
    });
    unit.onInvocation(record('action'));

    await unit.execute();

    expect(trace).toEqual([
      'outer in',
      'inner in',
      'action',
      'inner out',
      'outer out',
    ]);
  });

  it('is the current context of every action it runs, and of nothing outside it', async () => {
    const unit = new UnitOfWork();
    let inside: ProcessingContext | undefined;
    unit.onInvocation(async () => {
      await Promise.resolve();
      inside = ProcessingContext.current();
    });

    await unit.execute();

    expect(inside).toBe(unit.processingContext);
    expect(ProcessingContext.current()).toBeUndefined();
  });

  it('does not nest: a unit run inside another is a unit of its own', async () => {
    const outer = new UnitOfWork();
    let innerContext: ProcessingContext | undefined;
    outer.onInvocation(async () => {
      const inner = new UnitOfWork();
      inner.onInvocation(() => {
        innerContext = ProcessingContext.current();
      });
      inner.onAfterCommit(record('inner committed'));
      await inner.execute();
      trace.push('outer invocation ends');
    });
    outer.onAfterCommit(record('outer committed'));

    await outer.execute();

    expect(innerContext).not.toBe(outer.processingContext);
    expect(trace).toEqual([
      'inner committed',
      'outer invocation ends',
      'outer committed',
    ]);
  });

  describe('its resources', () => {
    const counter = new ResourceKey<number>('counter');
    const other = new ResourceKey<number>('counter');

    it('are keyed by the key object, not by its label', async () => {
      const unit = new UnitOfWork();
      const context = unit.processingContext;

      context.putResource(counter, 1);

      expect(context.getResource(counter)).toBe(1);
      expect(context.getResource(other)).toBeUndefined();
    });

    it('have the operations of a concurrent map', () => {
      const context = new UnitOfWork().processingContext;

      expect(context.putResourceIfAbsent(counter, 1)).toBeUndefined();
      expect(context.putResourceIfAbsent(counter, 2)).toBe(1);
      expect(context.computeResourceIfAbsent(counter, () => 3)).toBe(1);
      expect(context.updateResource(counter, (value = 0) => value + 1)).toBe(2);
      expect(context.updateResource(counter, () => undefined)).toBeUndefined();
      expect(context.containsResource(counter)).toBe(false);
      expect(context.putResource(counter, 5)).toBeUndefined();
      expect(context.removeResource(counter)).toBe(5);
    });

    it('refuse a recursive update of the same key', () => {
      const context = new UnitOfWork().processingContext;

      expect(() =>
        context.computeResourceIfAbsent(counter, () =>
          context.computeResourceIfAbsent(counter, () => 1),
        ),
      ).toThrow(/recursive update/);
    });
  });

  describe('a branch of its context', () => {
    const message = new ResourceKey<string>('message');
    const shared = new ResourceKey<string>('shared');

    it('differs in one resource and shares every other, and the phases', async () => {
      const unit = new UnitOfWork();
      const context = unit.processingContext;
      context.putResource(message, 'the root');
      const branch = context.withResource(message, 'the branch');
      let seenInAction: string | undefined;
      branch.onPrepareCommit((running) => {
        seenInAction = running.getResource(message);
        running.putResource(shared, 'written through the branch');
      });

      await unit.execute();

      expect(context.getResource(message)).toBe('the root');
      expect(branch.getResource(message)).toBe('the branch');
      expect(seenInAction).toBe('the branch');
      expect(context.getResource(shared)).toBe('written through the branch');
    });

    it('is the current context of the actions registered on it', async () => {
      const unit = new UnitOfWork();
      const branch = unit.processingContext.withResource(message, 'the branch');
      let current: ProcessingContext | undefined;
      branch.onInvocation(() => {
        current = ProcessingContext.current();
      });

      await unit.execute();

      expect(current).toBe(branch);
      expect(current?.phase).toEqual(DefaultPhases.INVOCATION);
    });
  });
});
