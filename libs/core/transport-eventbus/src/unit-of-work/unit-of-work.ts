import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';

import { Message } from '../messaging/message';
import type { Phase } from './phase';
import { ProcessingContext } from './processing-context';
import type {
  CompletionAction,
  ErrorAction,
  PhaseAction,
} from './processing-lifecycle';
import { ProcessingLifecycle } from './processing-lifecycle';
import type { ResourceKey } from './resource-key';

/**
 * **What wraps every phase action of a unit** — Axon 5's `ProcessingLifecycleInterceptor`. A
 * transaction manager uses one to run each action inside the transaction it opened.
 */
export type ProcessingLifecycleInterceptor = (
  action: PhaseAction,
) => PhaseAction;

/** How a unit of work runs — Axon 5's `UnitOfWorkConfiguration`. */
export interface UnitOfWorkConfiguration {
  /** The unit's identifier: the command's, for a command's unit. A random UUID otherwise. */
  readonly identifier?: string;
  /**
   * Whether the actions of one phase run one after the other instead of all at once — Axon's
   * `forcedSameThreadInvocation`, which a transaction manager asks for when everything written in the
   * unit goes through one connection (JPA's `EntityManager`, MikroORM's).
   */
  readonly sequential?: boolean;
  /** Wrap every phase action, outermost first. */
  readonly interceptors?: readonly ProcessingLifecycleInterceptor[];
  /**
   * The message the unit handles — a command, an ingested event, a delivery of the outbox — kept in
   * its context from the start, so that what runs before the handler (the transaction manager, in
   * `PRE_INVOCATION`) can read it.
   */
  readonly message?: Message;
}

type Status = 'NOT_STARTED' | 'STARTED' | 'COMPLETED' | 'COMPLETED_ERROR';

interface PhaseActions {
  readonly phase: Phase;
  readonly actions: PhaseAction[];
}

interface Failure {
  readonly error: unknown;
  readonly phase: Phase;
}

/**
 * **One message, one unit of work** — Axon 5's `UnitOfWork`.
 *
 * It runs its phases in order ({@link DefaultPhases}), and the handler is only one action among the
 * others: {@link executeWithResult} registers it in `INVOCATION` and answers what it answered once the
 * whole unit — the commit included — has succeeded. A unit runs once; {@link execute} a second time
 * throws.
 *
 * ```ts
 * const post = await units.create({ identifier: command.id }).executeWithResult(async (context) => {
 *   const post = await posts.load(command.postId);   // sourced in this context
 *   post.complete(tags, now);
 *   post.commit();                                    // staged; appended and published at PREPARE_COMMIT
 *   return post;
 * });
 * ```
 *
 * ## Units do not nest, and they are not joined
 * Every command and every handled message gets a unit of its own, as in Axon 5 — `SimpleCommandBus`
 * creates one per command and never hands it the dispatcher's. What crosses from a dispatcher to what
 * it dispatches is correlation data, not the unit. Two units may still share one database
 * transaction: that is the transaction manager's decision, exactly as a JPA transaction already open
 * on the thread is joined by the next unit in Axon.
 */
export class UnitOfWork extends ProcessingLifecycle {
  private readonly context: UnitOfWorkProcessingContext;

  constructor(configuration: UnitOfWorkConfiguration = {}) {
    super();
    this.context = new UnitOfWorkProcessingContext(
      configuration.identifier ??
        configuration.message?.identifier ??
        randomUUID(),
      configuration,
    );
    if (configuration.message) {
      this.context.putResource(Message.RESOURCE_KEY, configuration.message);
    }
  }

  get identifier(): string {
    return this.context.identifier;
  }

  /** The context the unit's actions run in. */
  get processingContext(): ProcessingContext {
    return this.context;
  }

  on(phase: Phase, action: PhaseAction): this {
    this.context.on(phase, action);
    return this;
  }

  onError(action: ErrorAction): this {
    this.context.onError(action);
    return this;
  }

  whenComplete(action: CompletionAction): this {
    this.context.whenComplete(action);
    return this;
  }

  isStarted(): boolean {
    return this.context.isStarted();
  }

  isError(): boolean {
    return this.context.isError();
  }

  isCommitted(): boolean {
    return this.context.isCommitted();
  }

  isCompleted(): boolean {
    return this.context.isCompleted();
  }

  get phase(): Phase | undefined {
    return this.context.phase;
  }

  /** Runs every phase. Rejects with the first failure, after the error actions ran. */
  execute(): Promise<void> {
    return this.context.commit();
  }

  /**
   * Runs `action` in `INVOCATION` and every other phase around it, and answers what `action` answered
   * — only once the unit committed. A failure anywhere, the commit included, is what rejects.
   */
  async executeWithResult<R>(
    action: (context: ProcessingContext) => R | Promise<R>,
  ): Promise<R> {
    let result: R | undefined;
    this.onInvocation(async (context) => {
      result = await action(context);
    });
    await this.execute();
    return result as R;
  }
}

class UnitOfWorkProcessingContext extends ProcessingContext {
  private static readonly logger = new Logger(UnitOfWork.name);

  private status: Status = 'NOT_STARTED';
  private running?: Phase;
  private failure?: Failure;
  private readonly phases = new Map<number, PhaseActions>();
  private readonly errorActions: ErrorAction[] = [];
  private readonly completionActions: CompletionAction[] = [];
  private readonly resources = new Map<ResourceKey<unknown>, unknown>();
  private readonly computing = new Set<ResourceKey<unknown>>();

  constructor(
    readonly identifier: string,
    private readonly configuration: UnitOfWorkConfiguration,
  ) {
    super();
  }

  on(phase: Phase, action: PhaseAction): this {
    if (!this.accepts(phase)) {
      throw new Error(
        `unit of work ${this.identifier} cannot run an action in ${phase.name}: ` +
          (this.isCompleted()
            ? 'it is already over'
            : `it is already in ${this.running?.name}`),
      );
    }
    const registered = this.phases.get(phase.order);
    if (registered) {
      registered.actions.push(action);
    } else {
      this.phases.set(phase.order, { phase, actions: [action] });
    }
    return this;
  }

  onError(action: ErrorAction): this {
    const failure = this.failure;
    if (this.status === 'COMPLETED_ERROR' && failure) {
      void this.silently(() => action(this, failure.phase, failure.error));
      return this;
    }
    this.errorActions.push(action);
    return this;
  }

  whenComplete(action: CompletionAction): this {
    if (this.status === 'COMPLETED') {
      void this.silently(() => action(this));
      return this;
    }
    this.completionActions.push(action);
    return this;
  }

  isStarted(): boolean {
    return this.status !== 'NOT_STARTED';
  }

  isError(): boolean {
    return this.failure !== undefined;
  }

  isCommitted(): boolean {
    return this.status === 'COMPLETED';
  }

  isCompleted(): boolean {
    return this.status === 'COMPLETED' || this.status === 'COMPLETED_ERROR';
  }

  get phase(): Phase | undefined {
    return this.running;
  }

  async commit(): Promise<void> {
    if (this.status !== 'NOT_STARTED') {
      throw new Error(
        `unit of work ${this.identifier} cannot be committed (again)`,
      );
    }
    this.status = 'STARTED';

    for (
      let next = this.nextPhase();
      next && !this.failure;
      next = this.nextPhase()
    ) {
      this.phases.delete(next.phase.order);
      this.running = next.phase;
      await this.runPhase(next);
    }

    if (this.failure) {
      this.status = 'COMPLETED_ERROR';
      const { error, phase } = this.failure;
      for (const action of this.errorActions.splice(0)) {
        await this.silently(() => action(this, phase, error));
      }
      throw error;
    }

    this.status = 'COMPLETED';
    for (const action of this.completionActions.splice(0)) {
      await this.silently(() => action(this));
    }
  }

  getResource<T>(key: ResourceKey<T>): T | undefined {
    return this.resources.get(key) as T | undefined;
  }

  containsResource(key: ResourceKey<unknown>): boolean {
    return this.resources.has(key);
  }

  putResource<T>(key: ResourceKey<T>, value: T): T | undefined {
    const previous = this.getResource(key);
    this.resources.set(key, value);
    return previous;
  }

  putResourceIfAbsent<T>(key: ResourceKey<T>, value: T): T | undefined {
    const existing = this.getResource(key);
    if (existing !== undefined) {
      return existing;
    }
    this.resources.set(key, value);
    return undefined;
  }

  computeResourceIfAbsent<T>(key: ResourceKey<T>, supply: () => T): T {
    const existing = this.getResource(key);
    if (existing !== undefined) {
      return existing;
    }
    if (this.computing.has(key)) {
      throw new Error(
        `recursive update of ${key} in unit of work ${this.identifier}`,
      );
    }
    this.computing.add(key);
    try {
      const value = supply();
      if (value !== undefined) {
        this.resources.set(key, value);
      }
      return value;
    } finally {
      this.computing.delete(key);
    }
  }

  updateResource<T>(
    key: ResourceKey<T>,
    update: (current: T | undefined) => T | undefined,
  ): T | undefined {
    const value = update(this.getResource(key));
    if (value === undefined) {
      this.resources.delete(key);
    } else {
      this.resources.set(key, value);
    }
    return value;
  }

  removeResource<T>(key: ResourceKey<T>): T | undefined {
    const previous = this.getResource(key);
    this.resources.delete(key);
    return previous;
  }

  private nextPhase(): PhaseActions | undefined {
    let lowest: PhaseActions | undefined;
    for (const registered of this.phases.values()) {
      if (!lowest || registered.phase.order < lowest.phase.order) {
        lowest = registered;
      }
    }
    return lowest;
  }

  private async runPhase({ phase, actions }: PhaseActions): Promise<void> {
    if (this.configuration.sequential) {
      for (const action of actions) {
        await this.invoke(action).catch((error: unknown) =>
          this.fail(error, phase),
        );
      }
      return;
    }
    const settled = await Promise.allSettled(
      actions.map((action) => this.invoke(action)),
    );
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        this.fail(outcome.reason, phase);
      }
    }
  }

  private invoke(action: PhaseAction): Promise<unknown> {
    const intercepted = (this.configuration.interceptors ?? []).reduceRight(
      (inner, interceptor) => interceptor(inner),
      action,
    );
    try {
      return Promise.resolve(
        ProcessingContext.runIn(this, () => intercepted(this)),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private fail(error: unknown, phase: Phase): void {
    if (!this.failure) {
      this.failure = { error, phase };
      return;
    }
    const first = this.failure.error;
    if (typeof first === 'object' && first !== null) {
      const suppressed = (first as { suppressed?: unknown[] }).suppressed ?? [];
      Object.defineProperty(first, 'suppressed', {
        value: [...suppressed, error],
        enumerable: false,
        configurable: true,
      });
    }
  }

  private async silently(action: () => unknown): Promise<void> {
    try {
      await ProcessingContext.runIn(this, action);
    } catch (error) {
      UnitOfWorkProcessingContext.logger.error(
        `an error or completion action of unit of work ${this.identifier} failed; it does not change the outcome`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
