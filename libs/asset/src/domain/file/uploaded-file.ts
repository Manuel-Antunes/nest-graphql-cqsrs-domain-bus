import { FileNotFoundException } from '../errors/attachment.exceptions';
import type { LocalInput } from './local-input';

/**
 * A file a request carried, in whichever shape the platform's multipart parser hands it over:
 * multer's `Express.Multer.File` (`originalname`, `mimetype`, `size`, and `buffer` or `path`),
 * `@fastify/multipart`'s saved file (`filename`, `mimetype`, `filepath`), or AdonisJS's own
 * (`clientName`, `tmpPath`, `size`).
 */
export interface UploadedFile {
  originalname?: string;
  filename?: string;
  clientName?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
  path?: string;
  filepath?: string;
  tmpPath?: string;
}

/** What an {@link UploadedFile} holds, whatever its shape. */
export interface UploadedFileContents {
  input: LocalInput;
  name?: string;
  mimeType?: string;
}

export class UploadedFiles {
  static contentsOf(file: UploadedFile): UploadedFileContents {
    const name = file.originalname ?? file.clientName ?? file.filename;
    const input = file.buffer ?? file.path ?? file.filepath ?? file.tmpPath;
    if (!input) {
      throw new FileNotFoundException(name ?? 'the uploaded file');
    }
    return {
      input,
      name,
      mimeType:
        file.mimetype && file.mimetype !== 'application/octet-stream'
          ? file.mimetype
          : undefined,
    };
  }
}
