import type { OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EntityManager,
  EntityMetadata,
  EntityProperty,
  EventArgs,
  EventSubscriber,
  FlushEventArgs,
  TransactionEventArgs,
} from '@nestposts/database';
import { ChangeSetType, MikroORM, ReferenceKind } from '@nestposts/database';

import { resolveAttachmentOptions } from '../../../domain/context/resolve-attachment-options';
import { Asset } from '../../../domain/data-objects/asset';
import type { AssetProps } from '../../../domain/schemas/asset.schema';
import type {
  AttachmentOptions,
  ResolvedAttachmentOptions,
} from '../../../domain/schemas/attachment-options.schema';
import { DiskService } from '../../../domain/storage/disk.service';
import { AttachmentDatabaseType } from '../types/attachment-database.type';

interface AttachmentSlot {
  prop: EntityProperty;
  path: readonly string[];
  options: AttachmentOptions;
}

interface AttachRecord {
  asset: Asset;
  oldName: string;
  newName: string;
  options: ResolvedAttachmentOptions;
}

interface PendingOps {
  attached: AttachRecord[];
  deletes: { key: string; options: ResolvedAttachmentOptions }[];
}

/**
 * Runs the lifecycle of every `attachment()` column: binds the disk and resolves the URL on load,
 * promotes a staged asset on flush, deletes a replaced or removed object once the transaction
 * commits, and puts a promoted object back when it rolls back.
 */
@Injectable()
export class AssetAttachmentSubscriber
  implements EventSubscriber, OnModuleInit
{
  private readonly logger = new Logger(AssetAttachmentSubscriber.name);
  private readonly index = new WeakMap<EntityMetadata, AttachmentSlot[]>();
  private readonly pending = new WeakMap<EntityManager, PendingOps>();

  constructor(
    @Inject(MikroORM) private readonly orm: MikroORM,
    private readonly disks: DiskService,
  ) {}

  onModuleInit() {
    const managed: string[] = [];
    for (const meta of this.orm.getMetadata().getAll().values()) {
      if (meta.embeddable) {
        continue;
      }
      this.warnAboutObjectModeEmbeddables(meta);
      if (this.slotsFor(meta).length > 0 && !meta.abstract && meta.tableName) {
        managed.push(meta.className);
      }
    }
    this.orm.em.getEventManager().registerSubscriber(this);
    this.logger.log(
      `Managing attachments of: ${managed.join(', ') || '(none)'}`,
    );
  }

  async onLoad(args: EventArgs<object>): Promise<void> {
    const slots = this.slotsFor(args.meta);
    if (slots.length === 0) return;

    await Promise.all(
      slots.map(async (slot) => {
        const asset = this.read(args.entity, slot.path);
        if (!asset) return;
        const options = this.resolve(slot, args.entity);
        await asset.bindAttachment(this.disks.getDisk(options.disk), options);
      }),
    );
  }

  async onFlush(args: FlushEventArgs): Promise<void> {
    const ops = this.opsFor(args.em);

    for (const cs of args.uow.getChangeSets()) {
      const slots = this.slotsFor(cs.meta);
      if (slots.length === 0) continue;
      let promoted = false;

      for (const slot of slots) {
        const options = this.resolve(slot, cs.entity);
        const current = this.read(cs.entity, slot.path);
        const previousKey = this.extractName(
          (cs.originalEntity as Record<string, unknown> | undefined)?.[
            slot.prop.name
          ],
        );

        if (
          cs.type === ChangeSetType.DELETE ||
          cs.type === ChangeSetType.DELETE_EARLY
        ) {
          const key = previousKey ?? this.safeName(current);
          if (key) ops.deletes.push({ key, options });
          continue;
        }

        const changed = previousKey !== this.safeName(current);

        if (!current) {
          if (cs.type === ChangeSetType.UPDATE && changed && previousKey) {
            ops.deletes.push({ key: previousKey, options });
          }
          continue;
        }

        if (!current.persisted) {
          const oldName = current.name;
          await current.initializeAttachment(
            this.disks.getDisk(options.disk),
            options,
          );
          ops.attached.push({
            asset: current,
            oldName,
            newName: current.name,
            options,
          });
          promoted = true;
        } else if (changed) {
          await current.bindAttachment(
            this.disks.getDisk(options.disk),
            options,
          );
        }

        if (
          cs.type === ChangeSetType.UPDATE &&
          previousKey &&
          previousKey !== this.safeName(current)
        ) {
          ops.deletes.push({ key: previousKey, options });
        }
      }

      if (promoted) args.uow.recomputeSingleChangeSet(cs.entity);
    }
  }

  async afterFlush(args: FlushEventArgs): Promise<void> {
    if (args.em.isInTransaction()) return;
    await this.settle(args.em);
  }

  async afterTransactionCommit(args: TransactionEventArgs): Promise<void> {
    await this.settle(args.em);
  }

  async afterTransactionRollback(args: TransactionEventArgs): Promise<void> {
    const ops = this.pending.get(args.em);
    if (!ops) return;
    this.pending.delete(args.em);

    for (const record of [...ops.attached].reverse()) {
      const disk = this.disks.getDisk(record.options.disk);
      try {
        if (record.options.keepSource) {
          await disk.delete(record.newName);
        } else {
          await disk.move(record.newName, record.oldName);
        }
        record.asset.revertAttachment(record.oldName);
      } catch (error) {
        this.logger.error(
          `Could not undo the attach of ${record.oldName} as ${record.newName} after a rollback`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private slotsFor(meta: EntityMetadata): AttachmentSlot[] {
    let slots = this.index.get(meta);
    if (!slots) {
      slots = Object.values(meta.properties)
        .filter((prop) => prop.customType instanceof AttachmentDatabaseType)
        .map((prop) => ({
          prop,
          path: this.entityPath(meta, prop),
          options: (prop.customType as AttachmentDatabaseType).options,
        }));
      this.index.set(meta, slots);
    }
    return slots;
  }

  private async settle(em: EntityManager): Promise<void> {
    const ops = this.pending.get(em);
    if (!ops) return;
    this.pending.delete(em);
    if (ops.deletes.length === 0) return;

    const results = await Promise.allSettled(
      ops.deletes.map(({ key, options }) =>
        this.disks.getDisk(options.disk).delete(key),
      ),
    );
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Could not delete the replaced object ${ops.deletes[i].key}: ${result.reason}`,
        );
      }
    }
  }

  private opsFor(em: EntityManager): PendingOps {
    let ops = this.pending.get(em);
    if (!ops) {
      ops = { attached: [], deletes: [] };
      this.pending.set(em, ops);
    }
    return ops;
  }

  private entityPath(
    meta: EntityMetadata,
    prop: EntityProperty,
  ): readonly string[] {
    if (!prop.embedded) return [prop.name];
    const [parentName, childName] = prop.embedded;
    const parent = meta.properties[parentName];
    return parent ? [...this.entityPath(meta, parent), childName] : [prop.name];
  }

  private resolve(
    slot: AttachmentSlot,
    entity: object,
  ): ResolvedAttachmentOptions {
    return resolveAttachmentOptions(slot.options, {
      entity,
      path: slot.path,
    });
  }

  private read(entity: object, path: readonly string[]): Asset | null {
    let holder = entity as Record<string, unknown>;
    for (const segment of path.slice(0, -1)) {
      const next = holder?.[segment];
      if (next == null || typeof next !== 'object') return null;
      holder = next as Record<string, unknown>;
    }
    const key = path[path.length - 1];
    const value = holder?.[key];
    if (value == null) return null;
    if (value instanceof Asset) return value;
    if (typeof value !== 'object') return null;

    const asset = new Asset(value as AssetProps);
    holder[key] = asset;
    return asset;
  }

  private extractName(raw: unknown): string | undefined {
    if (raw == null) return undefined;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (data as AssetProps).name || undefined;
    } catch {
      return undefined;
    }
  }

  private safeName(value: Asset | null | undefined): string | undefined {
    try {
      return value?.name;
    } catch {
      return undefined;
    }
  }

  private warnAboutObjectModeEmbeddables(meta: EntityMetadata): void {
    for (const prop of Object.values(meta.properties)) {
      if (prop.kind !== ReferenceKind.EMBEDDED || !prop.object) continue;
      const holdsAttachment = Object.values(
        prop.targetMeta?.properties ?? {},
      ).some((child) => child.customType instanceof AttachmentDatabaseType);
      if (holdsAttachment) {
        this.logger.warn(
          `${meta.className}.${prop.name} is an object-mode embeddable holding an attachment(), ` +
            'whose lifecycle is NOT managed. Map it flattened (object: false).',
        );
      }
    }
  }
}
