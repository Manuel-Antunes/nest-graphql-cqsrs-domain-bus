import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Where a unit of work is in its life. The order is Axon's, and so is the reason for each step being
 * its own: `PREPARE_COMMIT` is where what must be **durable** is written, `COMMIT` is where the rest
 * of the system is told, and `CLEANUP` runs whichever of the two happened.
 */
export type UnitOfWorkPhase =
  | 'started'
  | 'prepareCommit'
  | 'commit'
  | 'afterCommit'
  | 'rollback'
  | 'cleanup'
  | 'closed';

export type UnitOfWorkListener = (unit: UnitOfWork) => Promise<void> | void;

/** How a unit of work that is **started** — not joined — treats the work it tracked. */
export interface UnitOfWorkOptions {
  /**
   * Whether a tracked piece of work that **failed** fails the unit: it rolls back and the first
   * failure is rethrown by {@link UnitOfWork.run}. Off by default — see {@link UnitOfWork.track}.
   *
   * It is for the caller that can do something with the answer: an ingestion whose message is
   * redelivered when it fails, so a saga's command that threw becomes a retry instead of a log line.
   */
  readonly failOnTrackedFailure?: boolean;
}

const storage = new AsyncLocalStorage<UnitOfWork>();

/**
 * **One command, one unit of work — and the command does not answer until its events are safe.**
 *
 * This is Axon's `UnitOfWork`, in the shape this framework can have one. The problem it solves is the
 * one `aggregate.commit()` creates: it publishes, nobody awaits it, and whatever the publish started
 * — appending to the event log, handing the event to a transport — is still in flight when the
 * command handler returns. In a process that is invisible. In a function it is a bug: a Lambda is
 * frozen the moment its handler returns, and work merely started does not continue.
 *
 * The fix is not to chase the loose ends afterwards. It is to make the command's own promise cover
 * them:
 *
 * ```
 * commandBus.execute(command)
 *   └─ started        the handler runs; every publish is STAGED, nothing is sent
 *   └─ prepareCommit  the staged events are appended to the event log        ← awaited
 *   └─ commit         they reach the local bus and the transports            ← awaited
 *   └─ afterCommit    whatever wanted to know it all worked
 *   └─ cleanup        always
 * ```
 *
 * `execute` resolves after `afterCommit`, so a caller that awaits the command has awaited the events.
 * There is nothing left to drain.
 *
 * ## What a failure now does, and why it is better
 * A handler that throws goes to `rollback` and the staged events are **discarded**. Before, they had
 * already been published by the time the failure happened, so a command could fail and still have
 * told the world it succeeded. An event is a fact, and a unit of work is what makes a fact true only
 * once the work is.
 *
 * ## Publishing during the commit
 * A listener may itself publish — a projection deciding something, a handler raising a follow-up. Its
 * events are staged like the others and the prepare phase runs again for them, until there is nothing
 * left. That loop is Axon's too, and it is bounded by {@link MAX_COMMIT_ROUNDS}: a listener that
 * publishes on every pass is a bug that should say so rather than hang.
 */
export class UnitOfWork {
  private static readonly MAX_COMMIT_ROUNDS = 10;

  private readonly listeners = new Map<UnitOfWorkPhase, UnitOfWorkListener[]>();

  private readonly pending = new Set<Promise<unknown>>();

  private readonly failures: unknown[] = [];

  private constructor(
    readonly request?: object,
    private readonly options: UnitOfWorkOptions = {},
  ) {}

  private current: UnitOfWorkPhase = 'started';

  /** The unit of work this call is inside, if any. */
  static current(): UnitOfWork | undefined {
    return storage.getStore();
  }

  /** Whether a unit of work is open — what a publisher asks before deciding to stage or to send. */
  static isStarted(): boolean {
    return storage.getStore() !== undefined;
  }

  /**
   * Runs `work` in a unit of work, commits it and answers what `work` answered. A failure rolls back
   * and is rethrown untouched.
   *
   * A unit of work already open, still taking work and belonging to the **same request** is
   * **joined**, not nested: a saga that dispatches a command with `request.attachTo(command)` commits
   * once, with everything, which is what keeps one request one unit. Joining also {@link track}s the
   * work, so the unit waits for it. One that has started committing is not joined, and neither is one
   * that belongs to a different request — see {@link covers}. `options` apply to a unit this call
   * starts; a joined one keeps its own.
   */
  static async run<T>(
    work: () => Promise<T>,
    request?: object,
    options?: UnitOfWorkOptions,
  ): Promise<T> {
    const running = storage.getStore();
    if (running?.staging && running.covers(request)) {
      return running.track(work());
    }

    const unit = new UnitOfWork(request, options);
    return storage.run(unit, async () => {
      try {
        const result = await work();
        await unit.commit();
        return result;
      } catch (failure) {
        await unit.rollback();
        throw failure;
      }
    });
  }

  get phase(): UnitOfWorkPhase {
    return this.current;
  }

  /**
   * Whether this unit still takes work. It does while the handler runs and while it is preparing —
   * the prepare phase runs again for whatever was staged during it — and it does not once it has
   * started telling the world. A handler reacting to a committed event and dispatching a command of
   * its own is a **new** piece of work, not a late addition to one that is already leaving.
   *
   * Axon says the same thing by throwing (`Unit of Work is already committed`). Here it is a
   * question, because the caller has somewhere sensible to go: publish now.
   */
  /**
   * **Whether this unit is the one that request belongs to.**
   *
   * This is Axon's `UnitOfWork<T extends Message<?>>`: the unit is scoped to the message being
   * handled, and `getMessage()` is part of it. Here the message is the `AsyncContext` this
   * repository already propagates — the same object `PostRequest.of(event)` answers with — so the
   * unit and the request stop being two scopes saying almost the same thing.
   *
   * Where it bites: a request that arrived from **another service** and a request opened here are
   * different objects, and work belonging to one must not be committed as part of the other. Unknown
   * on either side means no evidence of a different request, and the unit is shared — which is what
   * keeps a command dispatched without a context from starting a unit of its own.
   */
  covers(request?: object): boolean {
    return (
      request === undefined ||
      this.request === undefined ||
      this.request === request
    );
  }

  get staging(): boolean {
    return this.current === 'started' || this.current === 'prepareCommit';
  }

  /** What to do when this unit reaches that phase. Listeners run in the order they were added. */
  on(phase: UnitOfWorkPhase, listener: UnitOfWorkListener): void {
    const existing = this.listeners.get(phase) ?? [];
    existing.push(listener);
    this.listeners.set(phase, existing);
  }

  /**
   * **Work this unit must wait for**, and the reason it exists at all.
   *
   * `@nestjs/cqrs` hands an event to its handlers and returns: `bind()` uses `mergeMap` and drops
   * what the handler answered, and a saga's `commandBus.execute` is dispatched into the same void.
   * In a process that is invisible — the loop drains eventually. In a function it is the bug that
   * ends a saga halfway: the handler returns, Lambda freezes the container, and the command the saga
   * dispatched never finishes. Measured on the deployed stack, with the log stopping dead one line
   * after `was born untagged — completing it`.
   *
   * Axon does not have the problem because a subscribing processor runs **inside** the unit of work
   * that published, and the commit waits for it. This is that, in the shape this framework allows:
   * whoever dispatches registers, and the unit does not commit until everything registered is done.
   *
   * It waits for work to **finish**, not to succeed. A handler that throws is the bus's business —
   * it already logs and reports it — and a unit that adjudicated would be deciding twice. The
   * exception is a unit started with {@link UnitOfWorkOptions.failOnTrackedFailure}, whose caller has
   * asked to be told.
   */
  track<T>(work: Promise<T>): Promise<T> {
    const settled = work.then(
      () => undefined,
      (failure: unknown) => {
        this.failures.push(failure);
      },
    );
    this.pending.add(settled);
    void settled.finally(() => this.pending.delete(settled));
    return work;
  }

  async commit(): Promise<void> {
    await this.settle();

    for (
      let round = 0;
      this.listeners.get('prepareCommit')?.length;
      round += 1
    ) {
      if (round >= UnitOfWork.MAX_COMMIT_ROUNDS) {
        throw new Error(
          `a unit of work was still staging work after ${UnitOfWork.MAX_COMMIT_ROUNDS} prepare ` +
            'rounds: something published during the commit publishes again every time',
        );
      }
      this.current = 'prepareCommit';
      await this.drain('prepareCommit');
    }

    this.current = 'commit';
    await this.drain('commit');
    this.current = 'afterCommit';
    await this.drain('afterCommit');
    await this.close();
  }

  async rollback(): Promise<void> {
    this.current = 'rollback';
    await this.drain('rollback');
    await this.close();
  }

  /**
   * Everything registered, finished — including whatever that work registered in its turn, which is
   * how a saga's command that publishes an event whose handler dispatches another is still one unit.
   */
  private async settle(): Promise<void> {
    for (let round = 0; this.pending.size > 0; round += 1) {
      if (round >= UnitOfWork.MAX_COMMIT_ROUNDS) {
        throw new Error(
          `a unit of work was still waiting for work after ${UnitOfWork.MAX_COMMIT_ROUNDS} rounds: ` +
            'something it is waiting for starts more work every time',
        );
      }
      await Promise.all([...this.pending]);
    }
    if (this.options.failOnTrackedFailure && this.failures.length > 0) {
      throw this.failures[0];
    }
  }

  private async close(): Promise<void> {
    this.current = 'cleanup';
    await this.drain('cleanup');
    this.current = 'closed';
  }

  private async drain(phase: UnitOfWorkPhase): Promise<void> {
    const pending = this.listeners.get(phase) ?? [];
    this.listeners.delete(phase);
    for (const listener of pending) {
      await listener(this);
    }
  }
}
