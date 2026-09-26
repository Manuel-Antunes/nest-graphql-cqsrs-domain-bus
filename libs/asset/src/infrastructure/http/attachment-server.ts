import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { MikroORM } from '@nestposts/database';

import type { Asset } from '../../domain/asset/asset';
import type { Attachment } from '../../domain/asset/attachment';
import { AttachmentManager } from '../attachment-manager';
import type { VariantJob } from '../variants/variant.service';
import { VariantService } from '../variants/variant.service';

/** A file ready to be sent: its bytes, and what they are. */
export interface ServedAsset {
  stream: Readable;
  mimeType: string;
  size: number;
  name: string;
}

/**
 * Answers an attachment's key id with its bytes — or a variant's, made on the spot when it does not
 * exist yet: what `@jrmc/adonis-attachment`'s attachments controller does, without the HTTP. A key id
 * that does not open, a row that is gone, an attachment since replaced and a variant no converter
 * makes all answer nothing.
 */
@Injectable()
export class AttachmentServer {
  constructor(
    @Inject(MikroORM) private readonly orm: MikroORM,
    private readonly manager: AttachmentManager,
    private readonly variants: VariantService,
  ) {}

  async serve(
    keyId: string,
    variant?: string,
  ): Promise<ServedAsset | undefined> {
    const job = this.jobOf(keyId);
    if (!job || (variant && !this.manager.converters.has(variant))) {
      return undefined;
    }
    const found = await this.variants.find(job);
    if (!found) {
      return undefined;
    }
    const asset = variant
      ? await this.variantOf(found.attachment, job, variant)
      : found.attachment;
    return {
      stream: await asset.getStream(),
      mimeType: asset.mimeType,
      size: asset.size,
      name: asset.name,
    };
  }

  private async variantOf(
    attachment: Attachment,
    job: Omit<VariantJob, 'variants'>,
    key: string,
  ): Promise<Asset> {
    const existing = attachment.getVariant(key);
    if (existing) {
      return existing;
    }
    await this.variants.run({ ...job, variants: [key], missingOnly: true });
    const again = await this.variants.find(job);
    return again?.attachment.getVariant(key) ?? again?.attachment ?? attachment;
  }

  private jobOf(keyId: string): Omit<VariantJob, 'variants'> | undefined {
    const payload = this.manager.keys.open(keyId);
    const meta =
      payload && this.orm.getMetadata().getByClassName(payload.entity, false);
    if (!payload || !meta) {
      return undefined;
    }
    return {
      meta,
      schema: payload.schema,
      where: payload.where,
      path: payload.path,
      key: payload.key,
    };
  }
}
