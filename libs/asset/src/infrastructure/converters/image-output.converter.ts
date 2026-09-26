import type { FormatEnum, ResizeOptions, Sharp as SharpImage } from 'sharp';

import type {
  BlurhashOptions,
  ConverterInput,
} from '../../domain/converter/converter';
import { Converter } from '../../domain/converter/converter';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { Blurhash } from '../media/blurhash';
import { Sharp } from '../media/sharp';

export type ImageFormat = keyof FormatEnum;

export type ImageFormatOptions = Parameters<SharpImage['toFormat']>[1];

/** How a converter writes the image it makes: `@jrmc/adonis-attachment`'s image converter options. */
export interface ImageOutputOptions {
  /** A width, or sharp's resize options. */
  resize?: number | ResizeOptions;
  /** `webp` unless told otherwise. */
  format?: ImageFormat;
  formatOptions?: ImageFormatOptions;
  /** Rotate by the EXIF orientation, then drop it. On unless turned off. */
  autoOrient?: boolean;
  blurhash?: BlurhashOptions;
}

/**
 * A converter whose variant is an image, written by `sharp` — the base of every built-in one.
 *
 * Each is built with static constructors and refined fluently; every step answers with a new
 * converter, so one can be shared and specialised without changing it:
 *
 * ```ts
 * ImageConverter.resize(300)
 * ImageConverter.resize({ width: 400, height: 400, fit: 'cover' }).format('jpeg', { quality: 80 })
 * ImageConverter.format('avif').blurhash()
 * VideoThumbnailConverter.at(2).resize(720)
 * PdfThumbnailConverter.page(1).resize(720).format('webp')
 * DocumentThumbnailConverter.create().resize(720)
 * AutodetectConverter.resize(1280)
 * ```
 */
export abstract class ImageOutputConverter<
  TOptions extends ImageOutputOptions = ImageOutputOptions,
> extends Converter {
  constructor(readonly options: TOptions = {} as TOptions) {
    super();
  }

  static create<T extends ImageOutputConverter>(this: new () => T): T {
    return new this();
  }

  static resize<T extends ImageOutputConverter>(
    this: new () => T,
    resize: number | ResizeOptions,
  ): T {
    return new this().resize(resize);
  }

  static format<T extends ImageOutputConverter>(
    this: new () => T,
    format: ImageFormat,
    options?: ImageFormatOptions,
  ): T {
    return new this().format(format, options);
  }

  resize(resize: number | ResizeOptions): this {
    return this.with({ resize } as Partial<TOptions>);
  }

  format(format: ImageFormat, options?: ImageFormatOptions): this {
    return this.with({ format, formatOptions: options } as Partial<TOptions>);
  }

  autoOrient(enabled = true): this {
    return this.with({ autoOrient: enabled } as Partial<TOptions>);
  }

  /** Makes a blurhash of every variant, 4×4 components unless told otherwise. */
  blurhash(options: Partial<BlurhashOptions> = {}): this {
    return this.with({
      blurhash: { ...Blurhash.DEFAULTS, ...options },
    } as Partial<TOptions>);
  }

  override get blurhashOptions(): BlurhashOptions | undefined {
    return this.options.blurhash;
  }

  /** A converter of the same kind, with `changes` over these options. */
  protected with(changes: Partial<TOptions>): this {
    const Kind = this.constructor as new (options: TOptions) => this;
    return new Kind({ ...this.options, ...changes });
  }

  /** Writes `input` as the image these options describe. Metadata is stripped, GPS included. */
  protected async toImage(input: ConverterInput): Promise<Buffer> {
    const sharp = await Sharp.load();
    const image = sharp(input);
    if (this.options.autoOrient ?? true) {
      image.autoOrient();
    }
    if (this.options.resize !== undefined) {
      image.resize(
        typeof this.options.resize === 'number'
          ? { width: this.options.resize }
          : this.options.resize,
      );
    }
    return image
      .toFormat(this.options.format ?? 'webp', this.options.formatOptions)
      .toBuffer();
  }

  /** Runs `work` on a path to `input`, writing a buffer to a temporary file first. */
  protected async throughFile<T>(
    input: ConverterInput,
    extname: string | undefined,
    work: (path: string) => Promise<T>,
  ): Promise<T> {
    const path = await TemporaryFile.pathOf(input, extname);
    try {
      return await work(path);
    } finally {
      if (path !== input) {
        await TemporaryFile.release(path);
      }
    }
  }

  /** Converts the image an external program wrote, and deletes it. */
  protected async fromRendered(path: string): Promise<Buffer> {
    try {
      return await this.toImage(path);
    } finally {
      await TemporaryFile.release(path);
    }
  }
}
