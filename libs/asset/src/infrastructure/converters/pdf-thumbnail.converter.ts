import type {
  ConverterContext,
  ConverterInput,
} from '../../domain/converter/converter';
import { Poppler } from '../media/poppler';
import type { ImageOutputOptions } from './image-output.converter';
import { ImageOutputConverter } from './image-output.converter';

export interface PdfThumbnailOptions extends ImageOutputOptions {
  /** The page rendered, from 1. The first unless told otherwise. */
  page?: number;
}

/** A page of a PDF, rendered by Poppler's `pdftoppm`: `PdfThumbnailConverter.page(1).resize(720)`. */
export class PdfThumbnailConverter extends ImageOutputConverter<PdfThumbnailOptions> {
  static page<T extends PdfThumbnailConverter>(
    this: new () => T,
    page: number,
  ): T {
    return new this().page(page);
  }

  page(page: number): this {
    return this.with({ page });
  }

  handle(input: ConverterInput, context: ConverterContext): Promise<Buffer> {
    return this.throughFile(input, 'pdf', async (path) =>
      this.fromRendered(
        await Poppler.thumbnail(path, this.options.page ?? 1, context),
      ),
    );
  }
}
