import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { TRANSPORT_OUTBOX_DESTINATIONS } from '../constants';
import { ErrorHandler, PropagatingErrorHandler } from './error-handler';

/**
 * **What processes a group** — Axon 5's two event processors.
 *
 * | | when the handlers run | in which unit of work | a failure |
 * |---|---|---|---|
 * | `subscribing` | in the `PREPARE_COMMIT` of the unit that published | that one, inside its transaction | fails it |
 * | `streaming` | after that unit committed, when the outbox's relay delivers the group's message | one of their own per message | is retried by the outbox, then dead-lettered |
 */
export type ProcessorKind = 'subscribing' | 'streaming';

export interface ProcessingGroupOptions {
  readonly processor?: ProcessorKind;
  /** What the group does when a handler fails; {@link PropagatingErrorHandler} by default. */
  readonly errorHandler?: ErrorHandler;
}

/** Every processing group that is not `subscribing` with the default error handler, by name. */
export type ProcessingGroupsOptions = Readonly<
  Record<string, ProcessorKind | ProcessingGroupOptions>
>;

export const PROCESSING_GROUPS_OPTIONS = Symbol('ProcessingGroupsOptions');

/** The application's processing groups, as `TransportEventBusModule`'s `processingGroups` declared them. */
@Injectable()
export class ProcessingGroups {
  private static readonly propagating = new PropagatingErrorHandler();
  private static readonly logger = new Logger(ProcessingGroups.name);

  private readonly groups: Map<string, ProcessingGroupOptions>;
  private readonly declared = new Map<string, ProcessorKind>();

  constructor(
    @Optional()
    @Inject(PROCESSING_GROUPS_OPTIONS)
    options?: ProcessingGroupsOptions,
    @Optional()
    @Inject(TRANSPORT_OUTBOX_DESTINATIONS)
    private readonly outbox?: readonly string[],
  ) {
    this.groups = new Map(
      Object.entries(options ?? {}).map(([name, declared]) => [
        name,
        typeof declared === 'string' ? { processor: declared } : declared,
      ]),
    );
  }

  /**
   * What a handler's `@ProcessingGroup` declared its group is processed by — the default the root's
   * `processingGroups` overrides. A group declared streaming where there is no outbox to deliver it
   * through — a suite that boots the bus alone — is processed as subscribing, and says so.
   */
  declare(processingGroup: string, processor: ProcessorKind): void {
    if (
      processor === 'streaming' &&
      !this.outbox &&
      this.processorOf(processingGroup) === undefined
    ) {
      ProcessingGroups.logger.warn(
        `processing group '${processingGroup}' is declared streaming, and there is no outbox to deliver ` +
          'it through: it is processed as subscribing',
      );
      return;
    }
    this.declared.set(processingGroup, processor);
  }

  isStreaming(processingGroup: string): boolean {
    return (
      (this.processorOf(processingGroup) ??
        this.declared.get(processingGroup)) === 'streaming'
    );
  }

  /** The groups the outbox delivers to. */
  get streaming(): string[] {
    return [...new Set([...this.groups.keys(), ...this.declared.keys()])]
      .filter((name) => this.isStreaming(name))
      .sort();
  }

  private processorOf(processingGroup: string): ProcessorKind | undefined {
    return this.groups.get(processingGroup)?.processor;
  }

  errorHandlerFor(processingGroup: string): ErrorHandler {
    return (
      this.groups.get(processingGroup)?.errorHandler ??
      ProcessingGroups.propagating
    );
  }
}
