import type { AssetMeta } from '../../domain/asset/schemas/asset-meta.schema';
import type { ConverterContext } from '../../domain/converter/converter';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { Command } from './command';

const DPI = 150;

/** Poppler's `pdftoppm` and `pdfinfo`: a page of a PDF as an image, and what the PDF is. */
export class Poppler {
  /** Renders `page` to a temporary JPEG and answers with its path. */
  static async thumbnail(
    input: string,
    page: number,
    context: ConverterContext,
  ): Promise<string> {
    const output = TemporaryFile.path();
    await Command.run(
      context.bin.pdftoppm ?? 'pdftoppm',
      [
        '-f',
        String(page),
        '-l',
        String(page),
        '-r',
        String(DPI),
        '-jpeg',
        '-singlefile',
        input,
        output,
      ],
      context.timeout,
    );
    return `${output}.jpg`;
  }

  static async info(
    input: string,
    context: ConverterContext,
  ): Promise<AssetMeta | undefined> {
    const { stdout } = await Command.run(
      context.bin.pdfinfo ?? 'pdfinfo',
      ['-isodates', input],
      context.timeout,
    );
    const fields = Poppler.fieldsOf(stdout);
    const size = /([\d.]+)\s*x\s*([\d.]+)/.exec(fields['page size'] ?? '');
    return {
      dimension: size
        ? {
            width: Math.round(Number(size[1])),
            height: Math.round(Number(size[2])),
          }
        : undefined,
      pages: Number(fields.pages) || undefined,
      version: fields['pdf version'],
      date: fields.creationdate,
    };
  }

  private static fieldsOf(output: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const line of output.split('\n')) {
      const colon = line.indexOf(':');
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      if (colon > 0 && key && value) {
        fields[key] = value;
      }
    }
    return fields;
  }
}
