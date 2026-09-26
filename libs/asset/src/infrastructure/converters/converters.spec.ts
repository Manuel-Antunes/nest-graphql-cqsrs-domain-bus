import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

import type { ConverterContext } from '../../domain/converter/converter';
import {
  CannotCreateVariantException,
  CommandFailedException,
} from '../../domain/errors/attachment.exceptions';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { Blurhash } from '../media/blurhash';
import { MediaMeta } from '../media/media-meta';
import { AutodetectConverter } from './autodetect.converter';
import { DocumentThumbnailConverter } from './document-thumbnail.converter';
import { ImageConverter } from './image.converter';
import { PdfThumbnailConverter } from './pdf-thumbnail.converter';
import { VideoThumbnailConverter } from './video-thumbnail.converter';

const installed = (bin: string, flag: string) =>
  spawnSync(bin, [flag], { stdio: 'ignore' }).status === 0;

const context = (
  file?: ConverterContext['file'],
  bin: ConverterContext['bin'] = {},
): ConverterContext => ({ bin, timeout: 30_000, file });

const image = (width = 40, height = 20) =>
  sharp({
    create: { width, height, channels: 3, background: '#336699' },
  })
    .png()
    .toBuffer();

const metadataOf = (output: unknown) => sharp(output as Buffer).metadata();

const pdf = (width: number, height: number): Buffer => {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${width} ${height}]>>`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj${object}endobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
};

describe('converters', () => {
  describe('built fluently', () => {
    it('answers every step with a new converter, leaving the one it came from alone', () => {
      const base = ImageConverter.resize(100);
      const jpeg = base.format('jpeg', { quality: 80 }).blurhash();

      expect(base.options).toEqual({ resize: 100 });
      expect(jpeg.options).toEqual({
        resize: 100,
        format: 'jpeg',
        formatOptions: { quality: 80 },
        blurhash: Blurhash.DEFAULTS,
      });
      expect(jpeg.blurhashOptions).toEqual({ componentX: 4, componentY: 4 });
    });

    it('keeps the kind of converter a static constructor was called on', () => {
      const video = VideoThumbnailConverter.resize(720).at(5);
      const page = PdfThumbnailConverter.page(3).format('png');
      const document = DocumentThumbnailConverter.create().autoOrient(false);

      expect(video).toBeInstanceOf(VideoThumbnailConverter);
      expect(video.options).toEqual({ resize: 720, startTime: 5 });
      expect(page).toBeInstanceOf(PdfThumbnailConverter);
      expect(page.options).toEqual({ page: 3, format: 'png' });
      expect(document).toBeInstanceOf(DocumentThumbnailConverter);
    });
  });

  describe('ImageConverter', () => {
    it('resizes to a width and writes webp unless told otherwise', async () => {
      const output = await ImageConverter.resize(10).handle(await image());

      expect(await metadataOf(output)).toMatchObject({
        format: 'webp',
        width: 10,
        height: 5,
      });
    });

    it('writes the format it is given, with sharp’s resize options', async () => {
      const output = await ImageConverter.resize({
        width: 8,
        height: 8,
        fit: 'cover',
      })
        .format('jpeg')
        .handle(await image());

      expect(await metadataOf(output)).toMatchObject({
        format: 'jpeg',
        width: 8,
        height: 8,
      });
    });

    it('makes a blurhash of an image', async () => {
      expect(await Blurhash.encode(await image())).toHaveLength(36);
    });
  });

  describe('AutodetectConverter', () => {
    it('resizes an image, and makes nothing of a file no converter handles', async () => {
      const converter = AutodetectConverter.resize(10).format('png');

      const output = await converter.handle(
        await image(),
        context({ extname: 'png', mimeType: 'image/png' }),
      );
      const nothing = await converter.handle(
        Buffer.from('PK'),
        context({ extname: 'zip', mimeType: 'application/zip' }),
      );

      expect(await metadataOf(output)).toMatchObject({
        format: 'png',
        width: 10,
      });
      expect(nothing).toBeUndefined();
    });

    it('recognises office documents by their MIME type', () => {
      expect(
        DocumentThumbnailConverter.handles(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe(true);
      expect(
        DocumentThumbnailConverter.handles(
          'application/vnd.oasis.opendocument.text',
        ),
      ).toBe(true);
      expect(DocumentThumbnailConverter.handles('image/png')).toBe(false);
    });
  });

  describe.skipIf(
    !installed('ffmpeg', '-version') || !installed('ffprobe', '-version'),
  )('video, through ffmpeg', () => {
    let video: string;

    beforeAll(async () => {
      video = TemporaryFile.path('mp4');
      const made = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=duration=3:size=64x48:rate=10',
          '-pix_fmt',
          'yuv420p',
          video,
        ],
        { stdio: 'ignore' },
      );
      expect(made.status).toBe(0);
    });

    afterAll(() => TemporaryFile.remove(video));

    it('takes a frame at the second it is told, as an image', async () => {
      const output = await VideoThumbnailConverter.at(1)
        .resize(32)
        .handle(video, context({ extname: 'mp4', mimeType: 'video/mp4' }));

      expect(await metadataOf(output)).toMatchObject({
        format: 'webp',
        width: 32,
        height: 24,
      });
    });

    it('says so when the video is shorter than the second asked for', async () => {
      await expect(
        VideoThumbnailConverter.at(30).handle(video, context()),
      ).rejects.toThrow(CannotCreateVariantException);
    });

    it('reads the dimensions, duration and codec of a video', async () => {
      expect(await MediaMeta.read(video, 'video/mp4', context())).toMatchObject(
        {
          dimension: { width: 64, height: 48 },
          duration: 3,
          videoCodec: 'h264',
        },
      );
    });

    it('names a program that is not where it was said to be', async () => {
      await expect(
        VideoThumbnailConverter.create().handle(
          video,
          context(undefined, { ffmpeg: '/nowhere/ffmpeg' }),
        ),
      ).rejects.toThrow(
        new CommandFailedException('/nowhere/ffmpeg', 'it is not installed'),
      );
    });
  });

  describe.skipIf(!installed('pdftoppm', '-v') || !installed('pdfinfo', '-v'))(
    'PDF, through Poppler',
    () => {
      it('renders a page of a PDF held in memory, as an image', async () => {
        const output = await PdfThumbnailConverter.page(1)
          .resize(50)
          .format('png')
          .handle(
            pdf(200, 100),
            context({ extname: 'pdf', mimeType: 'application/pdf' }),
          );

        expect(await metadataOf(output)).toMatchObject({
          format: 'png',
          width: 50,
          height: 25,
        });
      });

      it('reads the pages and the page size of a PDF', async () => {
        expect(
          await MediaMeta.read(pdf(200, 100), 'application/pdf', context()),
        ).toMatchObject({
          pages: 1,
          dimension: { width: 200, height: 100 },
        });
      });
    },
  );

  describe('image metadata', () => {
    it('reads what the EXIF of an image says', async () => {
      const jpeg = await sharp({
        create: { width: 3, height: 2, channels: 3, background: '#000' },
      })
        .jpeg()
        .withExif({ IFD0: { Software: 'nestposts-test' } })
        .toBuffer();

      expect(await MediaMeta.read(jpeg, 'image/jpeg', context())).toMatchObject(
        { host: 'nestposts-test' },
      );
    });

    it('reads the dimensions of a PNG', async () => {
      expect(
        await MediaMeta.read(await image(7, 3), 'image/png', context()),
      ).toMatchObject({ dimension: { width: 7, height: 3 } });
    });
  });
});
