import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Storage } from '@nestjs/storage';
import sharp from 'sharp';

import { TestDisks } from '../../infrastructure/testing/test-disks';
import {
  CannotCreateAttachmentException,
  DiskNotBoundException,
  NotABufferException,
  NotBase64Exception,
} from '../errors/attachment.exceptions';
import { TemporaryFile } from '../file/temporary-file';
import { Asset } from './asset';
import { Attachment } from './attachment';
import { Variant } from './variant';

const png = () =>
  sharp({
    create: { width: 2, height: 2, channels: 3, background: '#0f0' },
  })
    .png()
    .toBuffer();

describe('Attachment', () => {
  let storage: Storage;

  beforeEach(() => {
    const { default: fallback, disks } = TestDisks.options();
    storage = new Storage(new Map(Object.entries(disks)), fallback);
  });

  describe('static constructors', () => {
    it('makes a pending attachment of bytes in memory, told apart by the bytes', async () => {
      const attachment = await Attachment.fromBuffer(await png(), 'green.bin');

      expect(attachment).toBeInstanceOf(Attachment);
      expect(attachment.pending).toBe(true);
      expect(attachment.path).toBe('');
      expect(attachment).toMatchObject({
        extname: 'png',
        mimeType: 'image/png',
        originalName: 'green.bin',
      });
    });

    it('refuses what is not a buffer', async () => {
      await expect(
        Attachment.fromBuffer('nope' as unknown as Buffer),
      ).rejects.toThrow(NotABufferException);
    });

    it('decodes base64, bare or as a data URI, and refuses anything else', async () => {
      const bytes = await png();
      const fromUri = await Attachment.fromBase64(
        `data:image/png;base64,${bytes.toString('base64')}`,
      );
      const bare = await Attachment.fromBase64(bytes.toString('base64'));

      expect(fromUri.size).toBe(bytes.length);
      expect(bare.mimeType).toBe('image/png');
      await expect(Attachment.fromBase64('not base64!')).rejects.toThrow(
        NotBase64Exception,
      );
    });

    it('makes one of a local file, by its name first', async () => {
      const path = TemporaryFile.path('csv');
      await writeFile(path, 'a,b\n1,2\n');

      const attachment = await Attachment.fromPath(path);

      expect(attachment).toMatchObject({
        extname: 'csv',
        mimeType: 'text/csv',
        size: 8,
      });
      await TemporaryFile.remove(path);
    });

    it('drains a stream to a temporary file', async () => {
      const attachment = await Attachment.fromStream(
        Readable.from([Buffer.from('streamed')]),
        'notes.txt',
      );

      expect(attachment).toMatchObject({
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        size: 8,
      });
      expect(TemporaryFile.owns(attachment.source?.local)).toBe(true);
    });

    it('takes a file as multer hands it over, or as @fastify/multipart does', async () => {
      const bytes = await png();
      const multer = await Attachment.fromFile({
        originalname: 'avatar.png',
        mimetype: 'image/png',
        size: bytes.length,
        buffer: bytes,
      });
      const path = TemporaryFile.path();
      await writeFile(path, 'plain');
      const [fastify] = await Attachment.fromFiles([
        { filename: 'readme.txt', mimetype: 'text/plain', filepath: path },
      ]);

      expect(multer).toMatchObject({
        originalName: 'avatar.png',
        mimeType: 'image/png',
      });
      expect(fastify).toMatchObject({
        originalName: 'readme.txt',
        extname: 'txt',
      });
      await TemporaryFile.remove(path);
    });

    it('makes one of an object on a disk, trusting what it is told about it', () => {
      const attachment = Attachment.fromDisk('tmp/uploads/123', {
        size: 10,
        mimeType: 'image/jpeg',
        originalName: 'holiday.JPG',
      });

      expect(attachment).toMatchObject({
        extname: 'jpg',
        mimeType: 'image/jpeg',
        originalName: 'holiday.JPG',
      });
      expect(attachment.pending).toBe(true);
    });

    it('builds an Asset the same way, since the constructors belong to it', async () => {
      const asset = await Asset.fromBuffer(Buffer.from('x'), 'x.txt');

      expect(asset).toBeInstanceOf(Asset);
      expect(asset).not.toBeInstanceOf(Attachment);
    });
  });

  describe('storing', () => {
    it('writes the bytes where it is told, binds there, and lets the source go on commit', async () => {
      const attachment = await Attachment.fromStream(
        Readable.from([Buffer.from('stored')]),
        'stored.txt',
      );
      const temporary = attachment.source?.local as string;

      const write = await attachment.store(storage, {
        disk: 'private',
        path: 'docs/stored.txt',
      });

      expect(attachment.pending).toBe(false);
      expect(attachment).toMatchObject({
        disk: 'private',
        path: 'docs/stored.txt',
        name: 'stored.txt',
        folder: 'docs',
      });
      expect(await attachment.getBuffer()).toEqual(Buffer.from('stored'));
      expect(TemporaryFile.owns(temporary)).toBe(true);

      await write.commit();
      await expect(
        import('node:fs/promises').then(({ stat }) => stat(temporary)),
      ).rejects.toThrow();
    });

    it('undoes a store: the copy deleted, the attachment pending again', async () => {
      await storage.disk('public').put('staged/key', 'bytes');
      const attachment = Attachment.fromDisk('staged/key', {
        size: 5,
        mimeType: 'text/plain',
      });

      const write = await attachment.store(storage, {
        disk: 'public',
        path: 'final/key.txt',
      });
      await write.undo();

      expect(attachment.pending).toBe(true);
      expect(attachment.bound).toBe(false);
      expect(await storage.disk('public').exists('final/key.txt')).toBe(false);
      expect(await storage.disk('public').exists('staged/key')).toBe(true);
    });

    it('copies an object between disks', async () => {
      await storage.disk('private').put('elsewhere/key', 'moved');
      const attachment = Attachment.fromDisk('elsewhere/key', {
        disk: 'private',
        size: 5,
        mimeType: 'text/plain',
      });

      const write = await attachment.store(storage, {
        disk: 'public',
        path: 'here/key.txt',
      });
      await write.commit();

      expect(await storage.disk('public').getText('here/key.txt')).toBe(
        'moved',
      );
      expect(await storage.disk('private').exists('elsewhere/key')).toBe(false);
    });

    it('computes a signed url on a private disk and a plain one on a public disk', async () => {
      const onPrivate = await Attachment.fromBuffer(Buffer.from('p'), 'p.txt');
      await onPrivate.store(storage, { disk: 'private', path: 'a/p.txt' });
      const onPublic = await Attachment.fromBuffer(Buffer.from('q'), 'q.txt');
      await onPublic.store(storage, { disk: 'public', path: 'a/q.txt' });

      expect(TestDisks.isSigned(storage, await onPrivate.computeUrl())).toBe(
        true,
      );
      expect(await onPublic.computeUrl()).toBe(
        `${TestDisks.BASE_URL}/public/a/q.txt`,
      );
    });

    it('refuses to read before it is bound', async () => {
      const attachment = Attachment.restore({
        path: 'a/b.txt',
        size: 1,
        extname: 'txt',
        mimeType: 'text/plain',
      });

      await expect(attachment.getStream()).rejects.toThrow(
        DiskNotBoundException,
      );
    });
  });

  describe('restoring what a column stored', () => {
    const stored = {
      disk: 'public',
      path: 'covers/a.png',
      originalName: 'a.png',
      size: 3,
      extname: 'png',
      mimeType: 'image/png',
      variants: [
        {
          key: 'thumbnail',
          path: 'covers/variants/a.png/t.webp',
          size: 1,
          extname: 'webp',
          mimeType: 'image/webp',
          blurhash: 'LEHV6nWB2yk8',
        },
      ],
    };

    it('reads an object or its JSON text back into what was stored', () => {
      const fromObject = Attachment.restore(stored);
      const fromText = Attachment.restore(JSON.stringify(stored));

      const restored = {
        ...stored,
        variants: [{ ...stored.variants[0], originalName: 't.webp' }],
      };
      expect(fromObject.toObject()).toEqual(restored);
      expect(fromText.toObject()).toEqual(restored);
      expect(fromObject.getVariant('thumbnail')).toBeInstanceOf(Variant);
      expect(fromObject.getVariant('missing')).toBeNull();
    });

    it('names the attribute a stored value lacks', () => {
      expect(() =>
        Attachment.restore({
          path: 'x',
          extname: 'png',
          mimeType: 'image/png',
        }),
      ).toThrow(CannotCreateAttachmentException);
    });

    it('serializes each variant under its own key, as Adonis does', () => {
      const attachment = Attachment.restore(stored);
      attachment.url = 'https://cdn/a.png';

      expect(attachment.toJSON()).toEqual({
        name: 'a.png',
        originalName: 'a.png',
        size: 3,
        extname: 'png',
        mimeType: 'image/png',
        url: 'https://cdn/a.png',
        thumbnail: {
          name: 't.webp',
          extname: 'webp',
          mimeType: 'image/webp',
          size: 1,
          blurhash: 'LEHV6nWB2yk8',
        },
      });
    });

    it('replaces a variant made by the same converter, and hands back the ones it takes out', () => {
      const attachment = Attachment.restore(stored);
      const replacement = new Variant({
        key: 'thumbnail',
        path: 'covers/variants/a.png/new.webp',
        size: 2,
        extname: 'webp',
        mimeType: 'image/webp',
      });

      attachment.putVariant(replacement);
      expect(attachment.variants).toEqual([replacement]);
      expect(attachment.takeVariants(['thumbnail'])).toEqual([replacement]);
      expect(attachment.variants).toEqual([]);
    });
  });
});
