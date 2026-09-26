import type {
  ConverterContext,
  ConverterInput,
} from '../../domain/converter/converter';
import { Soffice } from '../media/soffice';
import { ImageOutputConverter } from './image-output.converter';

const DOCUMENT_MIME_TYPES = new Set([
  'application/msword',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-office',
  'application/vnd.visio',
  'application/mathml+xml',
  'application/x-msaccess',
]);

const DOCUMENT_MIME_PREFIXES = [
  'application/vnd.oasis.opendocument',
  'application/vnd.openxmlformats-officedocument',
];

/**
 * The first page of an office document — text, spreadsheet, presentation, drawing — rendered by a
 * headless LibreOffice: `DocumentThumbnailConverter.create().resize(720)`.
 */
export class DocumentThumbnailConverter extends ImageOutputConverter {
  /** Whether LibreOffice is the program to render a file of `mimeType`. */
  static handles(mimeType: string): boolean {
    return (
      DOCUMENT_MIME_TYPES.has(mimeType) ||
      DOCUMENT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
    );
  }

  handle(input: ConverterInput, context: ConverterContext): Promise<Buffer> {
    return this.throughFile(input, context.file?.extname, async (path) =>
      this.fromRendered(await Soffice.thumbnail(path, context)),
    );
  }
}
