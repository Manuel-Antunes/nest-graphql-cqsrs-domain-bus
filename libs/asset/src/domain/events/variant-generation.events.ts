/**
 * The names attachment events are emitted under on `@nestjs/event-emitter`'s `EventEmitter2` —
 * `@jrmc/adonis-attachment`'s `attachment:variant_*`, named the way `@nestjs-modules/mailer` names its
 * own `MailerEvent`s.
 *
 * ```ts
 * @OnEvent(AttachmentEvent.VARIANT_COMPLETED)
 * onVariants({ entity, primaryKey, generated }: VariantGenerationCompleted) {}
 * ```
 */
export enum AttachmentEvent {
  VARIANT_STARTED = 'attachment.variant_started',
  VARIANT_COMPLETED = 'attachment.variant_completed',
  VARIANT_FAILED = 'attachment.variant_failed',
}

/** Which attachment a variant generation is about: `@jrmc/adonis-attachment`'s event payload. */
export interface VariantGenerationSubject {
  /** The entity's name. */
  entity: string;
  tableName: string;
  /** The property, dotted when it is nested in an embeddable: `documents.identification.file`. */
  attribute: string;
  /** The primary key of the row. */
  primaryKey: unknown;
  /** The converters being run. */
  variants: readonly string[];
}

export abstract class VariantGenerationEvent
  implements VariantGenerationSubject
{
  readonly entity: string;
  readonly tableName: string;
  readonly attribute: string;
  readonly primaryKey: unknown;
  readonly variants: readonly string[];
  readonly timestamp = new Date();

  constructor(subject: VariantGenerationSubject) {
    this.entity = subject.entity;
    this.tableName = subject.tableName;
    this.attribute = subject.attribute;
    this.primaryKey = subject.primaryKey;
    this.variants = subject.variants;
  }
}

/** Emitted as {@link AttachmentEvent.VARIANT_STARTED}. */
export class VariantGenerationStarted extends VariantGenerationEvent {}

/** Emitted as {@link AttachmentEvent.VARIANT_COMPLETED}, with the variants that were actually made. */
export class VariantGenerationCompleted extends VariantGenerationEvent {
  constructor(
    subject: VariantGenerationSubject,
    readonly generated: readonly string[],
  ) {
    super(subject);
  }
}

/** Emitted as {@link AttachmentEvent.VARIANT_FAILED}, with what failed. */
export class VariantGenerationFailed extends VariantGenerationEvent {
  constructor(
    subject: VariantGenerationSubject,
    readonly error: unknown,
  ) {
    super(subject);
  }
}

/** The payload each {@link AttachmentEvent} is emitted with. */
export interface AttachmentEventPayloads {
  [AttachmentEvent.VARIANT_STARTED]: VariantGenerationStarted;
  [AttachmentEvent.VARIANT_COMPLETED]: VariantGenerationCompleted;
  [AttachmentEvent.VARIANT_FAILED]: VariantGenerationFailed;
}
