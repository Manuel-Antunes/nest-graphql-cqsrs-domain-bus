import type {
  ConverterContext,
  ConverterInput,
} from '../../domain/converter/converter';
import { FileInspector } from '../../domain/file/file-inspector';
import { DocumentThumbnailConverter } from './document-thumbnail.converter';
import { ImageConverter } from './image.converter';
import type { ImageOutputOptions } from './image-output.converter';
import { ImageOutputConverter } from './image-output.converter';
import { PdfThumbnailConverter } from './pdf-thumbnail.converter';
import { VideoThumbnailConverter } from './video-thumbnail.converter';

export interface AutodetectOptions extends ImageOutputOptions {
  startTime?: number;
  page?: number;
}

/**
 * Whichever converter the file calls for — an image is resized, a video, a PDF or an office document
 * is thumbnailed — with the same image options: `AutodetectConverter.resize(1280)`. A file none of
 * them handles has no variant.
 */
export class AutodetectConverter extends ImageOutputConverter<AutodetectOptions> {
  at(seconds: number): this {
    return this.with({ startTime: seconds });
  }

  page(page: number): this {
    return this.with({ page });
  }

  async handle(
    input: ConverterInput,
    context: ConverterContext,
  ): Promise<ConverterInput | undefined> {
    const mimeType =
      context.file?.mimeType ?? (await FileInspector.of(input)).mimeType;
    return AutodetectConverter.converterFor(mimeType, this.options)?.handle(
      input,
      context,
    );
  }

  private static converterFor(
    mimeType: string,
    options: AutodetectOptions,
  ): ImageOutputConverter | undefined {
    if (mimeType.startsWith('image/')) return new ImageConverter(options);
    if (mimeType.startsWith('video/')) {
      return new VideoThumbnailConverter(options);
    }
    if (mimeType === 'application/pdf') {
      return new PdfThumbnailConverter(options);
    }
    if (DocumentThumbnailConverter.handles(mimeType)) {
      return new DocumentThumbnailConverter(options);
    }
    return undefined;
  }
}
