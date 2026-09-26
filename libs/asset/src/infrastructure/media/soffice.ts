import { rename } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { ConverterContext } from '../../domain/converter/converter';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { Command } from './command';

/** LibreOffice (or OpenOffice), headless: the first page of an office document as an image. */
export class Soffice {
  /** Renders the document to a temporary JPEG and answers with its path. */
  static async thumbnail(
    input: string,
    context: ConverterContext,
  ): Promise<string> {
    const directory = await TemporaryFile.directory();
    try {
      await Command.run(
        context.bin.soffice ?? 'soffice',
        ['--headless', '--convert-to', 'jpg', '--outdir', directory, input],
        context.timeout,
      );
      const output = TemporaryFile.path('jpg');
      await rename(
        join(directory, `${basename(input, extname(input))}.jpg`),
        output,
      );
      return output;
    } finally {
      await TemporaryFile.remove(directory);
    }
  }
}
