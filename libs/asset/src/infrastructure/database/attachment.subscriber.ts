import type { OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EntityManager,
  EntityMetadata,
  EventArgs,
  EventSubscriber,
  FlushEventArgs,
  TransactionEventArgs,
} from '@nestposts/database';
import { ChangeSetType, MikroORM, ReferenceKind } from '@nestposts/database';

import type { AssetWrite } from '../../domain/asset/asset';
import type { Attachment } from '../../domain/asset/attachment';
import type { LocalInput } from '../../domain/file/local-input';
import type { ResolvedAttachmentOptions } from '../../domain/options/attachment-options';
import { AttachmentManager } from '../attachment-manager';
import { VariantService } from '../variants/variant.service';
import { AttachmentType } from './attachment.type';
import { AttachmentSlot } from './attachment-slot';

interface StoredAttachment {
  entity: object;
  slot: AttachmentSlot;
  attachment: Attachment;
  options: ResolvedAttachmentOptions;
  write: AssetWrite;
  input?: LocalInput;
}

interface RemovedAttachment {
  attachment: Attachment;
  disk?: string;
}

interface AttachmentUnit {
  stored: StoredAttachment[];
  removed: RemovedAttachment[];
}

/**
 * Runs the lifecycle of every `attachment()` and `attachments()` column, on MikroORM's own events —
 * `@jrmc/adonis-attachment`'s model hooks, as one global subscriber:
 *
 * | when | what it does |
 * |---|---|
 * | load | binds each attachment to its disk, resolves its URLs when `preComputeUrl`, seals its `keyId` |
 * | flush | stores every pending attachment where its options put it, reading its `meta` first, and recomputes the change set so the row holds the stored key |
 * | flush, replaced or cleared | queues the old attachment — and its variants — for deletion |
 * | delete | queues the row's attachments for deletion |
 * | commit | deletes what was queued, lets go of each source, and queues the variants |
 * | rollback | deletes what was stored, and puts every attachment back as it was, pending |
 *
 * Inside an explicit transaction nothing is deleted before the commit, because a rollback would
 * leave the row pointing at it.
 */
@Injectable()
export class AttachmentSubscriber implements EventSubscriber, OnModuleInit {
  private readonly logger = new Logger(AttachmentSubscriber.name);
  private readonly units = new WeakMap<EntityManager, AttachmentUnit>();

  constructor(
    @Inject(MikroORM) private readonly orm: MikroORM,
    private readonly manager: AttachmentManager,
    private readonly variants: VariantService,
  ) {}

  onModuleInit(): void {
    const managed: string[] = [];
    for (const meta of this.orm.getMetadata().getAll().values()) {
      if (meta.embeddable) {
        continue;
      }
      this.warnAboutObjectModeEmbeddables(meta);
      if (AttachmentSlot.of(meta).length > 0 && !meta.abstract) {
        managed.push(meta.className);
      }
    }
    this.orm.em.getEventManager().registerSubscriber(this);
    this.logger.log(
      `Managing attachments of: ${managed.join(', ') || '(none)'}`,
    );
  }

  async onLoad({ entity, meta, em }: EventArgs<object>): Promise<void> {
    await Promise.all(
      AttachmentSlot.of(meta).map(async (slot) => {
        const attachments = slot.read(entity);
        if (attachments.length === 0) {
          return;
        }
        const options = await this.manager.resolve(slot.options, {
          entity,
          path: slot.path,
        });
        await Promise.all(
          attachments.map((attachment) =>
            this.manager.prepare(
              attachment,
              options,
              this.keyOf(entity, slot, attachment, em),
            ),
          ),
        );
      }),
    );
  }

  async onFlush({ em, uow }: FlushEventArgs): Promise<void> {
    const unit = this.unitOf(em);
    const storedBefore = unit.stored.length;
    try {
      for (const changeSet of uow.getChangeSets()) {
        const slots = AttachmentSlot.of(changeSet.meta);
        let stored = false;
        for (const slot of slots) {
          const previous = slot.previous(changeSet.originalEntity);
          if (
            changeSet.type === ChangeSetType.DELETE ||
            changeSet.type === ChangeSetType.DELETE_EARLY
          ) {
            await this.remove(
              unit,
              slot,
              changeSet.entity,
              previous.length > 0 ? previous : slot.read(changeSet.entity),
            );
            continue;
          }
          const current = slot.read(changeSet.entity);
          stored =
            (await this.store(unit, slot, changeSet.entity, current)) || stored;
          const kept = new Set(current.map((attachment) => attachment.path));
          await this.remove(
            unit,
            slot,
            changeSet.entity,
            previous.filter((attachment) => !kept.has(attachment.path)),
          );
        }
        if (stored) {
          uow.recomputeSingleChangeSet(changeSet.entity);
        }
      }
    } catch (error) {
      await this.undo(unit.stored.splice(storedBefore));
      throw error;
    }
  }

  async afterFlush({ em }: FlushEventArgs): Promise<void> {
    if (em.isInTransaction()) {
      return;
    }
    await this.settle(em);
  }

  async afterTransactionCommit({ em }: TransactionEventArgs): Promise<void> {
    await this.settle(em);
  }

  async afterTransactionRollback({ em }: TransactionEventArgs): Promise<void> {
    const unit = this.units.get(em);
    if (!unit) {
      return;
    }
    this.units.delete(em);
    await this.undo(unit.stored);
  }

  private async store(
    unit: AttachmentUnit,
    slot: AttachmentSlot,
    entity: object,
    attachments: readonly Attachment[],
  ): Promise<boolean> {
    let stored = false;
    for (const attachment of attachments) {
      if (!attachment.pending && attachment.bound) {
        continue;
      }
      const options = await this.manager.resolve(slot.options, {
        entity,
        path: slot.path,
        originalName: attachment.originalName,
      });
      if (!attachment.pending) {
        await this.manager.prepare(attachment, options);
        continue;
      }
      const input = attachment.source?.local;
      const write = await this.manager.write(attachment, options, entity);
      unit.stored.push({ entity, slot, attachment, options, write, input });
      stored = true;
    }
    return stored;
  }

  private async remove(
    unit: AttachmentUnit,
    slot: AttachmentSlot,
    entity: object,
    attachments: readonly Attachment[],
  ): Promise<void> {
    if (attachments.length === 0) {
      return;
    }
    const { disk } = await this.manager.resolve(slot.options, {
      entity,
      path: slot.path,
    });
    for (const attachment of attachments) {
      unit.removed.push({ attachment, disk });
    }
  }

  private async settle(em: EntityManager): Promise<void> {
    const unit = this.units.get(em);
    if (!unit) {
      return;
    }
    this.units.delete(em);

    const removals = await Promise.allSettled(
      unit.removed.map(({ attachment, disk }) =>
        this.manager.remove(attachment, disk),
      ),
    );
    for (const [index, removal] of removals.entries()) {
      if (removal.status === 'rejected') {
        this.logger.warn(
          `Could not delete the replaced object ${unit.removed[index].attachment.path}: ${removal.reason}`,
        );
      }
    }

    for (const stored of unit.stored) {
      await this.finish(stored, em);
    }
  }

  private async finish(stored: StoredAttachment, em: EntityManager) {
    const { entity, slot, attachment, options, write, input } = stored;
    const key = this.keyOf(entity, slot, attachment, em);
    if (key) {
      attachment.keyId = this.manager.keys.seal(key);
    }
    const commit = () =>
      write.commit().catch((error: unknown) => {
        this.logger.warn(
          `Could not release the source of ${attachment.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    if (options.variants.length === 0 || input === undefined) {
      await commit();
    }
    if (options.variants.length === 0) {
      return;
    }
    this.variants
      .schedule({
        ...AttachmentSlot.locate(entity, em),
        path: slot.path,
        key: attachment.path,
        variants: options.variants,
        input,
        release: input === undefined ? undefined : commit,
      })
      .catch(() => undefined);
  }

  private async undo(stored: readonly StoredAttachment[]): Promise<void> {
    for (const { attachment, write } of [...stored].reverse()) {
      try {
        await write.undo();
      } catch (error) {
        this.logger.error(
          `Could not undo the store of ${attachment.path} after a rollback`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private keyOf(
    entity: object,
    slot: AttachmentSlot,
    attachment: Attachment,
    em: EntityManager,
  ) {
    if (!this.manager.keys.enabled) {
      return undefined;
    }
    const { meta, schema, where } = AttachmentSlot.locate(entity, em);
    return {
      entity: meta.className,
      schema,
      where,
      path: slot.path,
      key: attachment.path,
    };
  }

  private unitOf(em: EntityManager): AttachmentUnit {
    let unit = this.units.get(em);
    if (!unit) {
      unit = { stored: [], removed: [] };
      this.units.set(em, unit);
    }
    return unit;
  }

  private warnAboutObjectModeEmbeddables(meta: EntityMetadata): void {
    for (const prop of Object.values(meta.properties)) {
      if (prop.kind !== ReferenceKind.EMBEDDED || !prop.object) continue;
      const holdsAttachment = Object.values(
        prop.targetMeta?.properties ?? {},
      ).some((child) => child.customType instanceof AttachmentType);
      if (holdsAttachment) {
        this.logger.warn(
          `${meta.className}.${prop.name} is an object-mode embeddable holding an attachment(), ` +
            'whose lifecycle is NOT managed. Map it flattened (object: false).',
        );
      }
    }
  }
}
