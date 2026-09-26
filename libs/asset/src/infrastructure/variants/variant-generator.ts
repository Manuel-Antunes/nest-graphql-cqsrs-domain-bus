import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

import { AssetSource } from '../../domain/asset/asset-source';
import type { Attachment } from '../../domain/asset/attachment';
import { Variant } from '../../domain/asset/variant';
import type { Converter } from '../../domain/converter/converter';
import { CannotCreateVariantException } from '../../domain/errors/attachment.exceptions';
import { FileInspector } from '../../domain/file/file-inspector';
import type { LocalInput } from '../../domain/file/local-input';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { AttachmentPath } from '../../domain/options/attachment-path';
import { AttachmentManager } from '../attachment-manager';
import { Blurhash } from '../media/blurhash';

/** What a generation made, and which converters failed at it. */
export interface GeneratedVariants {
  variants: Variant[];
  failures: { key: string; error: unknown }[];
}

/**
 * Runs converters over an attachment and stores what they make, beside the attachment, on its disk
 * — `@jrmc/adonis-attachment`'s `VariantGeneratorService`. It stores the variants and leaves the
 * attachment as it was: recording them on the entity is the caller's job.
 */
@Injectable()
export class VariantGenerator {
  private readonly logger = new Logger(VariantGenerator.name);

  constructor(private readonly manager: AttachmentManager) {}

  /**
   * Makes the variants `keys` name, from `input` when the caller still has the bytes, or from a
   * download of the stored file. A converter that fails is reported and does not stop the others.
   */
  async generate(
    attachment: Attachment,
    keys: readonly string[],
    input?: LocalInput,
  ): Promise<GeneratedVariants> {
    const result: GeneratedVariants = { variants: [], failures: [] };
    const converters = keys.flatMap((key) => {
      const converter = this.manager.converters.get(key);
      if (!converter) {
        this.logger.warn(`No converter is registered as "${key}"`);
      }
      return converter ? [{ key, converter }] : [];
    });
    if (converters.length === 0) {
      return result;
    }

    const source = input ?? (await this.download(attachment));
    try {
      for (const { key, converter } of converters) {
        try {
          const variant = await this.make(attachment, key, converter, source);
          if (variant) result.variants.push(variant);
        } catch (error) {
          this.logger.error(
            `Could not make the "${key}" variant of ${attachment.path}: ${error instanceof Error ? error.message : String(error)}`,
          );
          result.failures.push({ key, error });
        }
      }
    } finally {
      if (source !== input) {
        await TemporaryFile.release(source);
      }
    }
    return result;
  }

  /** Makes and stores one variant, or nothing when the converter has nothing to make of the file. */
  async make(
    attachment: Attachment,
    key: string,
    converter: Converter,
    input: LocalInput,
  ): Promise<Variant | undefined> {
    const output = await converter.handle(
      input,
      this.manager.contextFor(attachment),
    );
    if (output === undefined) {
      return undefined;
    }
    try {
      const facts = await FileInspector.of(output);
      const variant = new Variant(
        { ...facts, key, originalName: `${key}.${facts.extname}` },
        AssetSource.local(output),
      );
      if (converter.blurhashOptions) {
        variant.blurhash = await this.blurhashOf(output, converter, attachment);
      }
      const write = await variant.store(this.manager.drive, {
        disk: this.manager.diskOf(attachment),
        path: posix.join(
          AttachmentPath.variantFolder(attachment, this.manager.layout),
          `${randomUUID()}.${facts.extname}`,
        ),
      });
      await write.commit();
      return variant;
    } finally {
      if (output !== input) {
        await TemporaryFile.release(output);
      }
    }
  }

  private async download(attachment: Attachment): Promise<string> {
    if (!attachment.bound) {
      this.manager.bind(attachment);
    }
    try {
      return await TemporaryFile.fromStream(
        await attachment.getStream(),
        attachment.extname,
      );
    } catch (error) {
      throw new CannotCreateVariantException(
        `${attachment.path} could not be read`,
        { cause: error },
      );
    }
  }

  private async blurhashOf(
    output: LocalInput,
    converter: Converter,
    attachment: Attachment,
  ): Promise<string | undefined> {
    try {
      return await Blurhash.encode(output, converter.blurhashOptions);
    } catch (error) {
      this.logger.warn(
        `Could not make the blurhash of a variant of ${attachment.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
