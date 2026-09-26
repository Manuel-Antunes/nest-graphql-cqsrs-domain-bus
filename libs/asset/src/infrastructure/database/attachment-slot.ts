import type {
  EntityManager,
  EntityMetadata,
  EntityProperty,
} from '@nestposts/database';
import { helper } from '@nestposts/database';

import { Attachment } from '../../domain/asset/attachment';
import type { AttachmentOptions } from '../../domain/options/attachment-options';
import { AttachmentType } from './attachment.type';

/** Where a row is: enough to find it again from another entity manager, or another request. */
export interface EntityLocation {
  meta: EntityMetadata;
  schema?: string;
  where: Record<string, unknown>;
}

type Holder = Record<string, unknown>;

/**
 * One attachment property of an entity — top level, or nested in flattened embeddables — and the
 * way to read the attachments an instance holds there.
 */
export class AttachmentSlot {
  private static readonly index = new WeakMap<
    EntityMetadata,
    readonly AttachmentSlot[]
  >();

  private constructor(
    readonly prop: EntityProperty,
    readonly path: readonly string[],
    readonly type: AttachmentType,
  ) {}

  /** Every attachment property of the entity `meta` describes. */
  static of(meta: EntityMetadata): readonly AttachmentSlot[] {
    let slots = AttachmentSlot.index.get(meta);
    if (!slots) {
      slots = Object.values(meta.properties)
        .filter((prop) => prop.customType instanceof AttachmentType)
        .map(
          (prop) =>
            new AttachmentSlot(
              prop,
              AttachmentSlot.pathOf(meta, prop),
              prop.customType as AttachmentType,
            ),
        );
      AttachmentSlot.index.set(meta, slots);
    }
    return slots;
  }

  /** The slot at `path`, dotted or as segments. */
  static at(
    meta: EntityMetadata,
    path: readonly string[] | string,
  ): AttachmentSlot | undefined {
    const attribute = typeof path === 'string' ? path : path.join('.');
    return AttachmentSlot.of(meta).find((slot) => slot.attribute === attribute);
  }

  /** Where `entity`'s row is, for a job or a key id to find it again. */
  static locate(entity: object, em?: EntityManager): EntityLocation {
    const wrapped = helper(entity);
    const meta = wrapped.__meta;
    const keys = wrapped.getPrimaryKeys(true) ?? [];
    return {
      meta,
      schema: wrapped.getSchema() ?? em?.schema,
      where: Object.fromEntries(
        meta.primaryKeys.map((name, index) => [name, keys[index]]),
      ),
    };
  }

  get options(): AttachmentOptions {
    return this.type.options;
  }

  /** The property path, dotted: `documents.identification.file`. */
  get attribute(): string {
    return this.path.join('.');
  }

  /**
   * The attachments `entity` holds here. A stored value assigned as a plain object is turned into
   * an {@link Attachment} in place, so what is returned is what the entity holds.
   */
  read(entity: object): Attachment[] {
    const holder = this.holderOf(entity);
    const key = this.path[this.path.length - 1];
    const value = holder?.[key];
    if (!holder || value == null) {
      return [];
    }
    const attachments = this.type.convertToJSValue(value);
    if (!this.holdsInstances(value)) {
      holder[key] = attachments;
    }
    return AttachmentSlot.listOf(attachments);
  }

  /** What the row held before this flush, as its snapshot has it. Unreadable values count as none. */
  previous(original: object | undefined): Attachment[] {
    const raw = (original as Holder | undefined)?.[this.prop.name];
    if (raw == null) {
      return [];
    }
    try {
      return AttachmentSlot.listOf(this.type.convertToJSValue(raw));
    } catch {
      return [];
    }
  }

  private holdsInstances(value: unknown): boolean {
    return this.type.multiple
      ? Array.isArray(value) &&
          value.every((item) => item instanceof Attachment)
      : value instanceof Attachment;
  }

  private holderOf(entity: object): Holder | undefined {
    let holder = entity as Holder;
    for (const segment of this.path.slice(0, -1)) {
      const next = holder?.[segment];
      if (next == null || typeof next !== 'object') {
        return undefined;
      }
      holder = next as Holder;
    }
    return holder;
  }

  private static listOf(value: Attachment | Attachment[] | null): Attachment[] {
    if (value === null) return [];
    return Array.isArray(value) ? value : [value];
  }

  private static pathOf(
    meta: EntityMetadata,
    prop: EntityProperty,
  ): readonly string[] {
    if (!prop.embedded) return [prop.name];
    const [parentName, childName] = prop.embedded;
    const parent = meta.properties[parentName];
    return parent
      ? [...AttachmentSlot.pathOf(meta, parent), childName]
      : [prop.name];
  }
}
