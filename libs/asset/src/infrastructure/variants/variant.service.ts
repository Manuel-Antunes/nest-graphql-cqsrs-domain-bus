import type { BeforeApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from '@nestposts/database';
import { MikroORM } from '@nestposts/database';

import type { Attachment } from '../../domain/asset/attachment';
import type { Variant } from '../../domain/asset/variant';
import type { VariantGenerationSubject } from '../../domain/events/variant-generation.events';
import {
  AttachmentEvent,
  VariantGenerationCompleted,
  VariantGenerationFailed,
  VariantGenerationStarted,
} from '../../domain/events/variant-generation.events';
import type { LocalInput } from '../../domain/file/local-input';
import { AttachmentManager } from '../attachment-manager';
import type { EntityLocation } from '../database/attachment-slot';
import { AttachmentSlot } from '../database/attachment-slot';
import { AttachmentEventService } from '../events/attachment-event.service';
import { AttachmentLock } from '../locking/attachment-lock';
import { VariantGenerator } from './variant-generator';
import { VariantQueue } from './variant-queue';

/** One attachment whose variants are to be made: where it is, and which converters to run. */
export interface VariantJob extends EntityLocation {
  /** The property the attachment is held by. */
  path: readonly string[];
  /** The attachment's stored key: a job for an attachment since replaced does nothing. */
  key: string;
  variants: readonly string[];
  /** Make only the variants the attachment does not have yet — what serving one on demand needs. */
  missingOnly?: boolean;
  /** The bytes, when the process that stored them still has them. */
  input?: LocalInput;
  /** Called once the job is over, whatever its outcome. */
  release?: () => Promise<void>;
}

/**
 * Makes an attachment's variants and records them on its row — `@jrmc/adonis-attachment`'s variant
 * services: the generator, the persister and the purger, run under the attachment's lock, announced
 * as {@link AttachmentEvent}s through the {@link AttachmentEventService}.
 *
 * The row is read again, in the schema it lives in, and written through the ORM: a variant is kept
 * only if the attachment it was made of is still the one the row holds. The variants a generation
 * replaces are deleted once the row no longer points at them. The application waits for the queue
 * before it shuts down.
 */
@Injectable()
export class VariantService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(VariantService.name);

  constructor(
    @Inject(MikroORM) private readonly orm: MikroORM,
    private readonly manager: AttachmentManager,
    private readonly generator: VariantGenerator,
    readonly queue: VariantQueue,
    private readonly lock: AttachmentLock,
    private readonly events: AttachmentEventService,
  ) {}

  /** Lets what was queued finish before the connection it writes through is closed. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.queue.idle();
  }

  /** Queues `job`, and answers with the variants it made once it ran. */
  schedule(job: VariantJob): Promise<Variant[]> {
    return this.queue.push(() => this.run(job));
  }

  /** Runs `job` now, under the attachment's lock. */
  async run(job: VariantJob): Promise<Variant[]> {
    const subject = VariantService.subjectOf(job);
    try {
      return await this.lock.run(VariantService.lockOf(job), async () => {
        this.events.emit(
          AttachmentEvent.VARIANT_STARTED,
          new VariantGenerationStarted(subject),
        );
        try {
          const made = await this.generateAndRecord(job);
          this.events.emit(
            AttachmentEvent.VARIANT_COMPLETED,
            new VariantGenerationCompleted(
              subject,
              made.map((variant) => variant.key),
            ),
          );
          return made;
        } catch (error) {
          this.events.emit(
            AttachmentEvent.VARIANT_FAILED,
            new VariantGenerationFailed(subject, error),
          );
          this.logger.error(
            `Variants of ${subject.entity}.${subject.attribute} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      });
    } finally {
      await job.release?.();
    }
  }

  /** The attachment `job` points at, in a fresh entity manager, or nothing when it is gone or replaced. */
  async find(
    job: Pick<VariantJob, 'meta' | 'schema' | 'where' | 'path' | 'key'>,
  ): Promise<{ em: EntityManager; attachment: Attachment } | undefined> {
    const slot = AttachmentSlot.at(job.meta, job.path);
    if (!slot) {
      return undefined;
    }
    const em = this.orm.em.fork({ clear: true, schema: job.schema });
    const entity = await em.findOne(job.meta.class, job.where as never);
    const attachment = entity
      ? slot.read(entity).find((candidate) => candidate.path === job.key)
      : undefined;
    return attachment ? { em, attachment } : undefined;
  }

  private async generateAndRecord(job: VariantJob): Promise<Variant[]> {
    const found = await this.find(job);
    if (!found) {
      return [];
    }
    const { em, attachment } = found;
    const wanted = job.missingOnly
      ? job.variants.filter((key) => !attachment.getVariant(key))
      : job.variants;
    if (wanted.length === 0) {
      return [];
    }
    const { variants, failures } = await this.generator.generate(
      attachment,
      wanted,
      job.input,
    );
    const replaced = attachment.takeVariants(
      variants.map((variant) => variant.key),
    );
    for (const variant of variants) {
      attachment.putVariant(variant);
    }
    try {
      await em.flush();
    } catch (error) {
      await this.discard(variants, attachment);
      throw error;
    }
    await this.discard(replaced, attachment);
    if (failures.length > 0) {
      throw failures[0].error;
    }
    return variants;
  }

  private async discard(
    variants: readonly Variant[],
    attachment: Attachment,
  ): Promise<void> {
    const outcomes = await Promise.allSettled(
      variants.map((variant) =>
        this.manager.remove(variant, this.manager.diskOf(attachment)),
      ),
    );
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === 'rejected') {
        this.logger.warn(
          `Could not delete the variant ${variants[index].path}: ${outcome.reason}`,
        );
      }
    }
  }

  private static subjectOf(job: VariantJob): VariantGenerationSubject {
    const keys = Object.values(job.where);
    return {
      entity: job.meta.className,
      tableName: job.meta.tableName,
      attribute: job.path.join('.'),
      primaryKey: keys.length === 1 ? keys[0] : job.where,
      variants: job.variants,
    };
  }

  private static lockOf(job: VariantJob): string {
    return [
      'attachment',
      job.schema ?? '',
      job.meta.className,
      JSON.stringify(job.where),
      job.path.join('.'),
    ].join(':');
  }
}
