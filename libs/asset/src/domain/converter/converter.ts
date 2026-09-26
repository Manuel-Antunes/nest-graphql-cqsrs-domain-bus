import type { LocalInput } from '../file/local-input';

/** What a converter reads and writes: bytes in memory, or a path on the local file system. */
export type ConverterInput = LocalInput;

/** Where the external programs the built-in converters run are, when they are not on the `PATH`. */
export interface BinPaths {
  ffmpeg?: string;
  ffprobe?: string;
  pdftoppm?: string;
  pdfinfo?: string;
  soffice?: string;
}

/** What the module hands every converter: the programs' paths, how long one may run, and the file. */
export interface ConverterContext {
  readonly bin: BinPaths;
  /** Milliseconds an external program may run before it is killed. */
  readonly timeout: number;
  /** What the input is, as the attachment it belongs to knows it. */
  readonly file?: { readonly extname: string; readonly mimeType: string };
}

/** How detailed a blurhash is: components across and down, 1 to 9 each. */
export interface BlurhashOptions {
  componentX: number;
  componentY: number;
}

/**
 * Makes a variant of a file — the port every converter implements, `@jrmc/adonis-attachment`'s
 * `Converter`. The built-in ones (`ImageConverter`, `VideoThumbnailConverter`,
 * `PdfThumbnailConverter`, `DocumentThumbnailConverter`, `AutodetectConverter`) are built with their
 * static constructors; a converter of your own extends this class, the way a mail extends `Mail`:
 *
 * ```ts
 * export class Gif2WebpConverter extends Converter {
 *   async handle(input: ConverterInput): Promise<ConverterInput> {
 *     return sharp(input, { animated: true }).webp().toBuffer();
 *   }
 * }
 *
 * AttachmentModule.forRoot({ converters: { animated: new Gif2WebpConverter() } });
 * ```
 *
 * `handle` answers with the variant's bytes, or with a path to them — a temporary file is deleted
 * once the variant is stored — or with nothing, when there is no variant to make of that file.
 */
export abstract class Converter {
  /** Set to make a blurhash of every variant this converter makes. */
  get blurhashOptions(): BlurhashOptions | undefined {
    return undefined;
  }

  abstract handle(
    input: ConverterInput,
    context: ConverterContext,
  ): Promise<ConverterInput | undefined>;
}
