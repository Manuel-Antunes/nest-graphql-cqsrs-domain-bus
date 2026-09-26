import { Inject, Injectable } from '@nestjs/common';
import type { EntityName, FilterQuery } from '@nestposts/database';
import { helper, MikroORM } from '@nestposts/database';

import type { Variant } from '../../domain/asset/variant';
import { AttachmentManager } from '../attachment-manager';
import { AttachmentSlot } from '../database/attachment-slot';
import { VariantService } from './variant.service';

/** Which variants to make again: `@jrmc/adonis-attachment`'s `RegenerateOptions`. */
export interface RegenerateOptions {
  /** Only these properties, dotted when nested. Every attachment property otherwise. */
  attributes?: readonly string[];
  /** Only these variants — of those the property declares. Every one it declares otherwise. */
  variants?: readonly string[];
}

export interface RegenerateAllOptions<T> extends RegenerateOptions {
  where?: FilterQuery<T>;
  /** The schema the rows are in, for an entity that lives in one per tenant. */
  schema?: string;
  /** Rows read at a time. 100 unless told otherwise. */
  batchSize?: number;
}

/**
 * Makes an entity's variants again — after a converter changed, say — replacing the ones there are:
 * `@jrmc/adonis-attachment`'s `RegenerateService`. Only the variants a property declares are made.
 *
 * ```ts
 * await regenerate.entity(post, { variants: ['thumbnail'] });
 * await regenerate.all(Post, { attributes: ['cover'], schema: 'tenant_acme' });
 * ```
 */
@Injectable()
export class RegenerateService {
  constructor(
    @Inject(MikroORM) private readonly orm: MikroORM,
    private readonly manager: AttachmentManager,
    private readonly variants: VariantService,
  ) {}

  /** Regenerates the variants of one loaded entity, and answers with what was made. */
  async entity(
    entity: object,
    options: RegenerateOptions = {},
  ): Promise<Variant[]> {
    const location = AttachmentSlot.locate(entity);
    const jobs: Promise<Variant[]>[] = [];
    for (const slot of AttachmentSlot.of(helper(entity).__meta)) {
      if (options.attributes && !options.attributes.includes(slot.attribute)) {
        continue;
      }
      const resolved = await this.manager.resolve(slot.options, {
        entity,
        path: slot.path,
      });
      const variants = resolved.variants.filter(
        (key) => !options.variants || options.variants.includes(key),
      );
      if (variants.length === 0) {
        continue;
      }
      for (const attachment of slot.read(entity)) {
        if (!attachment.pending) {
          jobs.push(
            this.variants.schedule({
              ...location,
              path: slot.path,
              key: attachment.path,
              variants,
            }),
          );
        }
      }
    }
    return (await Promise.all(jobs)).flat();
  }

  /** Regenerates the variants of every row of `entityName` that `where` selects, a batch at a time. */
  async all<T extends object>(
    entityName: EntityName<T>,
    options: RegenerateAllOptions<T> = {},
  ): Promise<void> {
    const batchSize = options.batchSize ?? 100;
    const meta = this.orm.getMetadata().get(entityName);
    const orderBy = Object.fromEntries(
      meta.primaryKeys.map((key) => [key, 'asc']),
    );
    for (let offset = 0; ; offset += batchSize) {
      const em = this.orm.em.fork({ clear: true, schema: options.schema });
      const rows = await em.find(entityName, (options.where ?? {}) as never, {
        limit: batchSize,
        offset,
        orderBy: orderBy as never,
      });
      await Promise.all(rows.map((row) => this.entity(row, options)));
      if (rows.length < batchSize) {
        return;
      }
    }
  }
}
