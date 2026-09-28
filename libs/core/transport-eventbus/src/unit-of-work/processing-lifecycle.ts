import type { Phase } from './phase';
import { DefaultPhases } from './phase';
import type { ProcessingContext } from './processing-context';

/** What runs in a phase. It may answer a promise, and the phase waits for it. */
export type PhaseAction = (context: ProcessingContext) => unknown;

/** What runs when a phase failed: the context, the phase that failed and the first failure. */
export type ErrorAction = (
  context: ProcessingContext,
  phase: Phase,
  error: unknown,
) => unknown;

/** What runs once every phase succeeded. */
export type CompletionAction = (context: ProcessingContext) => unknown;

/**
 * **The phases of a piece of work, and what runs in each** — Axon 5's `ProcessingLifecycle`.
 *
 * An action is registered for a phase and runs when the unit reaches it. The rules are Axon's:
 *
 * - an action may only be registered for a phase **after** the one running now; registering for the
 *   running phase or an earlier one throws, because it would never run;
 * - the actions of one phase all run, and the phase is over when all of them are;
 * - an action that fails ends the unit: the rest of that phase still finishes, no later phase runs,
 *   and every {@link onError} action is told which phase failed and why;
 * - {@link whenComplete} actions run only when every phase succeeded; {@link doFinally} runs either
 *   way. What those two throw is logged and never changes the outcome.
 */
export abstract class ProcessingLifecycle {
  abstract on(phase: Phase, action: PhaseAction): this;

  abstract onError(action: ErrorAction): this;

  abstract whenComplete(action: CompletionAction): this;

  /** Whether the unit has started running its phases. */
  abstract isStarted(): boolean;

  /** Whether a phase failed. */
  abstract isError(): boolean;

  /** Whether every phase ran and succeeded — `false` during `COMMIT` and `AFTER_COMMIT`, as in Axon. */
  abstract isCommitted(): boolean;

  /** Whether the unit is over, successfully or not. */
  abstract isCompleted(): boolean;

  /** The phase running now; `undefined` before the first one starts. */
  abstract get phase(): Phase | undefined;

  onPreInvocation(action: PhaseAction): this {
    return this.on(DefaultPhases.PRE_INVOCATION, action);
  }

  onInvocation(action: PhaseAction): this {
    return this.on(DefaultPhases.INVOCATION, action);
  }

  onPostInvocation(action: PhaseAction): this {
    return this.on(DefaultPhases.POST_INVOCATION, action);
  }

  onPrepareCommit(action: PhaseAction): this {
    return this.on(DefaultPhases.PREPARE_COMMIT, action);
  }

  onCommit(action: PhaseAction): this {
    return this.on(DefaultPhases.COMMIT, action);
  }

  onAfterCommit(action: PhaseAction): this {
    return this.on(DefaultPhases.AFTER_COMMIT, action);
  }

  /** Runs `action` whether the unit succeeded or failed: an {@link onError} and a {@link whenComplete} at once. */
  doFinally(action: CompletionAction): this {
    this.onError((context) => action(context));
    return this.whenComplete(action);
  }

  /** Whether an action may still be registered for `phase` — see the rules above. */
  accepts(phase: Phase): boolean {
    const running = this.phase;
    return (
      !this.isCompleted() &&
      (running === undefined || phase.order > running.order)
    );
  }
}
