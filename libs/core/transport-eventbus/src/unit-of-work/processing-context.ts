import { AsyncLocalStorage } from 'node:async_hooks';

import type { Phase } from './phase';
import type {
  CompletionAction,
  ErrorAction,
  PhaseAction,
} from './processing-lifecycle';
import { ProcessingLifecycle } from './processing-lifecycle';
import type { ResourceKey } from './resource-key';

/**
 * **The context a message is handled in** — Axon 5's `ProcessingContext`: the phases of the unit of
 * work that handles it, and the resources that unit holds.
 *
 * ## Resources
 * Whatever a component must remember for the length of one unit — the events it staged, the
 * transaction it opened, the correlation data of the message being handled — it keeps here, under a
 * {@link ResourceKey} of its own. Nothing is global: the next unit starts empty.
 *
 * ## Branches
 * {@link withResource} answers a context that differs from this one in that single resource, and
 * shares everything else — the phases and every other resource. It is how the message being handled
 * reaches what it sets off without anybody passing it along: a subscribing handler is invoked in a
 * branch holding its event, and the correlation data of that event is what a command it dispatches is
 * stamped with.
 *
 * ## The current context
 * In Axon a context is an explicit parameter of every call. `@nestjs/cqrs` has no parameter to put it
 * in — `execute(command)`, `handle(event)` — so here it travels in an `AsyncLocalStorage`, and
 * {@link current} answers it. That is the only thing the storage is for: it never makes two units
 * one. A command dispatched from inside a unit gets a unit of its own, as in Axon.
 */
export abstract class ProcessingContext extends ProcessingLifecycle {
  private static readonly storage = new AsyncLocalStorage<ProcessingContext>();

  /** The context this call runs in, if any. */
  static current(): ProcessingContext | undefined {
    return ProcessingContext.storage.getStore();
  }

  /** Runs `work` with `context` as the {@link current} one. */
  static runIn<T>(context: ProcessingContext, work: () => T): T {
    return ProcessingContext.storage.run(context, work);
  }

  /** Runs `work` outside any context — what a unit started from inside another one needs to be on its own. */
  static runOutside<T>(work: () => T): T {
    return ProcessingContext.storage.exit(work);
  }

  abstract getResource<T>(key: ResourceKey<T>): T | undefined;

  abstract containsResource(key: ResourceKey<unknown>): boolean;

  /** Stores `value` and answers what the key held before. */
  abstract putResource<T>(key: ResourceKey<T>, value: T): T | undefined;

  /** Stores `value` unless the key holds something already, and answers what it held. */
  abstract putResourceIfAbsent<T>(key: ResourceKey<T>, value: T): T | undefined;

  /**
   * Answers what the key holds, or stores and answers what `supply` makes. `supply` must not ask for
   * the same key again: that is a recursive update, and it throws.
   */
  abstract computeResourceIfAbsent<T>(key: ResourceKey<T>, supply: () => T): T;

  /** Replaces what the key holds with what `update` answers; `undefined` removes it. */
  abstract updateResource<T>(
    key: ResourceKey<T>,
    update: (current: T | undefined) => T | undefined,
  ): T | undefined;

  /** Removes what the key holds, and answers it. */
  abstract removeResource<T>(key: ResourceKey<T>): T | undefined;

  /** A branch of this context in which `key` holds `value` — see the class note. */
  withResource<T>(key: ResourceKey<T>, value: T): ProcessingContext {
    return new ResourceOverridingProcessingContext(this, key, value);
  }
}

/**
 * **A context that differs from another in one resource** — Axon 5's
 * `ResourceOverridingProcessingContext`. Every action registered on it is registered on the context
 * it branches, and runs with the branch as its context.
 */
export class ResourceOverridingProcessingContext extends ProcessingContext {
  constructor(
    private readonly delegate: ProcessingContext,
    private readonly key: ResourceKey<unknown>,
    private value: unknown,
  ) {
    super();
  }

  on(phase: Phase, action: PhaseAction): this {
    this.delegate.on(phase, () =>
      ProcessingContext.runIn(this, () => action(this)),
    );
    return this;
  }

  onError(action: ErrorAction): this {
    this.delegate.onError((_context, phase, error) =>
      ProcessingContext.runIn(this, () => action(this, phase, error)),
    );
    return this;
  }

  whenComplete(action: CompletionAction): this {
    this.delegate.whenComplete(() =>
      ProcessingContext.runIn(this, () => action(this)),
    );
    return this;
  }

  isStarted(): boolean {
    return this.delegate.isStarted();
  }

  isError(): boolean {
    return this.delegate.isError();
  }

  isCommitted(): boolean {
    return this.delegate.isCommitted();
  }

  isCompleted(): boolean {
    return this.delegate.isCompleted();
  }

  get phase(): Phase | undefined {
    return this.delegate.phase;
  }

  getResource<T>(key: ResourceKey<T>): T | undefined {
    return key === this.key
      ? (this.value as T | undefined)
      : this.delegate.getResource(key);
  }

  containsResource(key: ResourceKey<unknown>): boolean {
    return key === this.key
      ? this.value !== undefined
      : this.delegate.containsResource(key);
  }

  putResource<T>(key: ResourceKey<T>, value: T): T | undefined {
    if (key !== this.key) {
      return this.delegate.putResource(key, value);
    }
    const previous = this.value as T | undefined;
    this.value = value;
    return previous;
  }

  putResourceIfAbsent<T>(key: ResourceKey<T>, value: T): T | undefined {
    if (key !== this.key) {
      return this.delegate.putResourceIfAbsent(key, value);
    }
    if (this.value !== undefined) {
      return this.value as T;
    }
    this.value = value;
    return undefined;
  }

  computeResourceIfAbsent<T>(key: ResourceKey<T>, supply: () => T): T {
    if (key !== this.key) {
      return this.delegate.computeResourceIfAbsent(key, supply);
    }
    if (this.value === undefined) {
      this.value = supply();
    }
    return this.value as T;
  }

  updateResource<T>(
    key: ResourceKey<T>,
    update: (current: T | undefined) => T | undefined,
  ): T | undefined {
    if (key !== this.key) {
      return this.delegate.updateResource(key, update);
    }
    this.value = update(this.value as T | undefined);
    return this.value as T | undefined;
  }

  removeResource<T>(key: ResourceKey<T>): T | undefined {
    if (key !== this.key) {
      return this.delegate.removeResource(key);
    }
    const previous = this.value as T | undefined;
    this.value = undefined;
    return previous;
  }
}
