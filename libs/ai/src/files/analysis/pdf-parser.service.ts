import { Injectable, Logger } from '@nestjs/common';

import type { PdfPageData, PdfPageImage } from './file-analysis.types';

@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  async extractPages(buffer: Buffer): Promise<PdfPageData[]> {
    await ensureDomMatrixPolyfill();
    const pdfjs = (await loadPdfjs()) as {
      getDocument: (args: unknown) => { promise: Promise<PdfDocumentProxy> };
      OPS: Record<string, number>;
    };
    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
    }).promise;

    const pages: PdfPageData[] = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const text = await this.readPageText(page);
        const images = await this.readPageImages(page, pdfjs.OPS);
        pages.push({ pageNumber: i, text, images });
      }
    } finally {
      await doc.destroy?.();
    }
    return pages;
  }

  private async readPageText(page: PdfPageProxy): Promise<string> {
    const content = await page.getTextContent();
    return content.items
      .map((item) => (item as { str?: string }).str ?? '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async readPageImages(
    page: PdfPageProxy,
    OPS: Record<string, number>,
  ): Promise<PdfPageImage[]> {
    const ops = await page.getOperatorList();
    const images: PdfPageImage[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (
        fn !== OPS.paintImageXObject &&
        fn !== OPS.paintImageXObjectRepeat &&
        fn !== OPS.paintInlineImageXObject
      ) {
        continue;
      }
      const args = ops.argsArray[i];
      const name = typeof args?.[0] === 'string' ? (args[0] as string) : null;
      if (!name || seen.has(name)) continue;
      seen.add(name);

      try {
        const obj = await new Promise<PdfImage | null>((resolve) => {
          page.objs.get(name, (img: PdfImage | null) => resolve(img ?? null));
        });
        if (!obj) continue;
        const png = await this.encodeRawPixelsToPng(obj);
        if (!png) continue;
        images.push({ name, mimeType: 'image/png', buffer: png });
      } catch (err) {
        this.logger.warn(
          `[readPageImages] could not decode image "${name}" on page: ${
            (err as Error)?.message ?? err
          }`,
        );
      }
    }
    return images;
  }

  private async encodeRawPixelsToPng(img: PdfImage): Promise<Buffer | null> {
    const { width, height, kind, data } = img;
    if (!width || !height || !data?.length) return null;

    let channels: 3 | 4;
    if (kind === 2) channels = 3;
    else if (kind === 3) channels = 4;
    else return null; // skip exotic kinds (e.g. grayscale 1bpp)

    const { default: sharp } = await dynamicImport<{
      default: typeof import('sharp');
    }>('sharp');
    return sharp(Buffer.from(data), { raw: { width, height, channels } })
      .png()
      .toBuffer();
  }
}

const dynamicImport = new Function('m', 'return import(m)') as <T>(
  specifier: string,
) => Promise<T>;

function loadPdfjs(): Promise<unknown> {
  return dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
}

let domMatrixPolyfillPromise: Promise<void> | undefined;

async function ensureDomMatrixPolyfill(): Promise<void> {
  if (
    typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix !== 'undefined'
  ) {
    return;
  }
  domMatrixPolyfillPromise ??= (async () => {
    const mod = (await import('dommatrix')) as unknown as {
      default?: unknown;
      DOMMatrix?: unknown;
    };
    const DOMMatrix = mod.DOMMatrix ?? mod.default;
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrix;
  })();
  await domMatrixPolyfillPromise;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
  destroy?(): Promise<void>;
}

interface PdfPageProxy {
  getTextContent(): Promise<{ items: Array<unknown> }>;
  getOperatorList(): Promise<{
    fnArray: number[];
    argsArray: unknown[][];
  }>;
  objs: {
    get(name: string, cb: (img: PdfImage | null) => void): void;
  };
}

interface PdfImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array;
}
