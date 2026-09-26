import type { Platform } from '@nestposts/database';
import { p, Type } from '@nestposts/database';

import { Attachment } from '../../domain/asset/attachment';
import type { AttachmentOptions } from '../../domain/options/attachment-options';

type AttachmentValue = Attachment | Attachment[] | null;

/**
 * Maps an {@link Attachment} — or a list of them — to a `json` column holding what
 * {@link Attachment.toObject} answers: the durable fields, and never a URL. It writes the value the
 * way MikroORM's own `JsonType` does, through the platform — never as a bare array, which `pg` would
 * send as a Postgres array.
 *
 * A column written before this library had `path` stores the key as `name`; it is read as the path.
 */
export class AttachmentType extends Type<AttachmentValue, string | null> {
  constructor(
    readonly options: AttachmentOptions = {},
    readonly multiple = false,
  ) {
    super();
  }

  override convertToJSValue(value: unknown): AttachmentValue {
    if (value == null || value === '') {
      return null;
    }
    if (this.multiple) {
      return Attachment.restoreAll(value);
    }
    return value instanceof Attachment ? value : Attachment.restore(value);
  }

  override convertToDatabaseValue(
    value: unknown,
    platform?: Platform,
  ): string | null {
    const attachments = this.convertToJSValue(value);
    if (attachments === null) {
      return null;
    }
    const stored = Array.isArray(attachments)
      ? attachments.map((attachment) => attachment.toObject())
      : attachments.toObject();
    return platform
      ? (platform.convertJsonToDatabaseValue(stored) as string)
      : JSON.stringify(stored);
  }

  override getColumnType(): string {
    return 'json';
  }
}

/**
 * An attachment property for `defineEntity` — `@jrmc/adonis-attachment`'s `@attachment()`: a `json`
 * column whose {@link Attachment} the `AttachmentSubscriber` stores, resolves, converts and deletes.
 *
 * ```ts
 * avatar: () => attachment({ folder: 'users/avatars', variants: ['thumbnail'] }).nullable()
 * ```
 *
 * MikroORM's own property options do what the decorator's did: `.hidden()` leaves it out of the
 * serialized entity, `.serializedName('photo')` renames it, `.serializer(fn)` replaces it.
 */
export const attachment = <TEntity = any>(
  options: AttachmentOptions<TEntity> = {},
) => p.type(new AttachmentType(options)).$type<Attachment>();

/**
 * A list of attachments in one `json` column — `@jrmc/adonis-attachment`'s `@attachments()`. Every
 * attachment of the list goes through the same lifecycle; a large or growing list is better kept as
 * a one-to-many relation of entities holding one `attachment()` each.
 */
export const attachments = <TEntity = any>(
  options: AttachmentOptions<TEntity> = {},
) => p.type(new AttachmentType(options, true)).$type<Attachment[]>();
