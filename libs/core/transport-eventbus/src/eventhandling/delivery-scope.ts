import { ProcessingContext } from '../unit-of-work/processing-context';
import { ResourceKey } from '../unit-of-work/resource-key';

/** A handler that failed during a delivery, with the processing group it belongs to. */
export interface DeliveryFailure {
  readonly processingGroup: string;
  readonly error: unknown;
}

const commandGroups = new WeakMap<object, string>();

/**
 * **One delivery of one event to the handlers of this process, and everything it set off.**
 *
 * `@nestjs/cqrs` hands an event to its handlers and returns: `bind()` drops what a handler answers,
 * and a saga's command is dispatched into the same void. In Axon a subscribing processor's handling
 * is a future the phase waits for, and a handler that dispatches a command answers that command's
 * future. This is that, in the shape `@nestjs/cqrs` allows: the delivery puts a scope in the context
 * it publishes in, every handler invoked in it and every command a saga dispatches in it
 * {@link track}s its promise here, and the delivery {@link settle}s before its phase is over — which
 * is also what keeps a Lambda from freezing a saga halfway.
 *
 * It also says **who** the delivery is for: the subscribing groups of the unit that published, or
 * one streaming group the outbox is delivering to. A handler outside it does nothing — which is how a
 * streaming group's handlers stay out of the publishing unit, and how a streaming delivery reaches
 * its own group only.
 */
export class DeliveryScope {
  static readonly KEY = new ResourceKey<DeliveryScope>('DeliveryScope');

  private readonly pending = new Set<Promise<void>>();
  private readonly failures: DeliveryFailure[] = [];

  private constructor(
    private readonly admission: (processingGroup: string) => boolean,
    /** The streaming group this delivery is for, `undefined` for the subscribing ones. */
    readonly processingGroup?: string,
  ) {}

  /** The delivery the current call is part of, if any. */
  static current(
    context: ProcessingContext | undefined = ProcessingContext.current(),
  ): DeliveryScope | undefined {
    return context?.getResource(DeliveryScope.KEY);
  }

  /** A delivery to every group that is not streaming. */
  static subscribing(
    isStreaming: (processingGroup: string) => boolean,
  ): DeliveryScope {
    return new DeliveryScope((group) => !isStreaming(group));
  }

  /** A delivery to that one streaming group. */
  static streaming(processingGroup: string): DeliveryScope {
    return new DeliveryScope(
      (group) => group === processingGroup,
      processingGroup,
    );
  }

  /** Remembers which group a saga's command came from, so its failure is that group's. */
  static markCommand(command: object, processingGroup: string): void {
    commandGroups.set(command, processingGroup);
  }

  static groupOfCommand(command: object): string | undefined {
    return commandGroups.get(command);
  }

  /** Whether a handler of that group takes part in this delivery. */
  admits(processingGroup: string): boolean {
    return this.admission(processingGroup);
  }

  /** Work this delivery must wait for, and whose failure is that group's. */
  track<T>(work: Promise<T>, processingGroup: string): Promise<T> {
    const settled = work.then(
      () => undefined,
      (error: unknown) => {
        this.failures.push({ processingGroup, error });
      },
    );
    this.pending.add(settled);
    void settled.finally(() => this.pending.delete(settled));
    return work;
  }

  /**
   * Everything tracked, finished — including whatever that work tracked in its turn, a saga's
   * command whose events set off another handler — and the failures, in the order they happened.
   */
  async settle(): Promise<DeliveryFailure[]> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
    return this.failures.splice(0);
  }
}
