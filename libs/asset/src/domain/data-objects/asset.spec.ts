import { plainToInstance } from 'class-transformer';
import type { Disk } from 'flydrive';

import { Asset } from './asset';

function makeDisk() {
  const move = vi.fn(async () => undefined);
  const copy = vi.fn(async () => undefined);
  const disk = {
    move,
    copy,
    getVisibility: vi.fn(async () => 'public' as const),
    getUrl: vi.fn(async (key: string) => `https://cdn.example/${key}`),
    getSignedUrl: vi.fn(
      async (key: string) => `https://cdn.example/${key}?sig`,
    ),
  } as unknown as Disk;
  return { disk, move, copy };
}

const STAGING_KEY = 'uploads/session-10/361.png';

const staged = () =>
  new Asset({
    name: STAGING_KEY,
    size: 4,
    extname: 'png',
    mimeType: 'image/png',
  });

describe('Asset', () => {
  it('is staged until it is attached', () => {
    const asset = Asset.fromUrl('https://example.com/avatar.png');

    expect(asset).toBeInstanceOf(Asset);
    expect(asset.persisted).toBe(false);
    expect(() => asset.url).toThrow(/not loaded/i);
  });

  describe('promoting a staged asset into its owned location', () => {
    it('moves the object by default, since a throwaway upload key has no other reader', async () => {
      const { disk, move, copy } = makeDisk();
      const asset = staged();

      await asset.initializeAttachment(disk, { folder: 'people/person-1' });

      expect(move).toHaveBeenCalledOnce();
      expect(copy).not.toHaveBeenCalled();
      const [source, destination] = move.mock.calls[0] as unknown as string[];
      expect(source).toBe(STAGING_KEY);
      expect(destination).toMatch(/^people\/person-1\/[0-9a-f-]{36}\.png$/);
      expect(asset.name).toBe(destination);
      expect(asset.persisted).toBe(true);
    });

    it('copies when keepSource is set, leaving a source someone else still reads in place', async () => {
      const { disk, move, copy } = makeDisk();
      const asset = staged();

      await asset.initializeAttachment(disk, {
        folder: 'people/person-1',
        keepSource: true,
      });

      expect(copy).toHaveBeenCalledOnce();
      expect(move).not.toHaveBeenCalled();
      const [source, destination] = copy.mock.calls[0] as unknown as string[];
      expect(source).toBe(STAGING_KEY);
      expect(asset.name).toBe(destination);
    });

    it('binds without ever touching storage, even for a not-yet-owned asset', async () => {
      const { disk, move, copy } = makeDisk();
      const asset = staged();

      await asset.bindAttachment(disk, { folder: 'people/person-1' });

      expect(move).not.toHaveBeenCalled();
      expect(copy).not.toHaveBeenCalled();
      expect(asset.name).toBe(STAGING_KEY);
      expect(asset.persisted).toBe(false);
      expect(asset.url).toBe(`https://cdn.example/${STAGING_KEY}`);
    });

    it('goes back to the staging key after a rolled-back attach', async () => {
      const { disk } = makeDisk();
      const asset = staged();
      await asset.initializeAttachment(disk, { folder: 'people/person-1' });
      expect(asset.persisted).toBe(true);

      asset.revertAttachment(STAGING_KEY);

      expect(asset.name).toBe(STAGING_KEY);
      expect(asset.persisted).toBe(false);
      expect(() => asset.url).toThrow(/not loaded/i);
    });

    it('leaves an already-owned asset alone', async () => {
      const { disk, move, copy } = makeDisk();
      const asset = new Asset({
        name: 'people/person-1/owned.png',
        size: 4,
        extname: 'png',
        mimeType: 'image/png',
        persisted: true,
      });

      await asset.initializeAttachment(disk, { folder: 'people/person-1' });

      expect(move).not.toHaveBeenCalled();
      expect(copy).not.toHaveBeenCalled();
      expect(asset.name).toBe('people/person-1/owned.png');
    });
  });

  describe('rebuilt by class-transformer', () => {
    it('survives a no-argument construction', () => {
      expect(() => new Asset()).not.toThrow();
    });

    it('keeps name, url and persisted through a plainToInstance round-trip', () => {
      const source = new Asset({
        name: 'people/person-1/1092.jpg',
        size: 1234,
        extname: 'jpg',
        mimeType: 'image/jpeg',
        persisted: true,
        url: 'https://cdn.example/signed',
      });

      const rebuilt = plainToInstance(Object, { asset: source }) as {
        asset: Asset;
      };

      expect(rebuilt.asset).toBeInstanceOf(Asset);
      expect(rebuilt.asset.name).toBe('people/person-1/1092.jpg');
      expect(rebuilt.asset.url).toBe('https://cdn.example/signed');
      expect(rebuilt.asset.persisted).toBe(true);
    });

    it('never carries its disk into the copy', async () => {
      const { disk } = makeDisk();
      const asset = staged();
      await asset.initializeAttachment(disk, { folder: 'people/person-1' });

      expect(Object.keys(asset)).not.toContain('_disk');
      expect(Object.keys(asset)).not.toContain('_attachmentOptions');
    });
  });

  describe('projections', () => {
    it('leaves the url out of the durable projection', async () => {
      const { disk } = makeDisk();
      const asset = staged();
      await asset.initializeAttachment(disk, { folder: 'people/person-1' });

      expect(asset.toPersistence()).toEqual({
        name: asset.name,
        size: 4,
        extname: 'png',
        mimeType: 'image/png',
        persisted: true,
      });
      expect(asset.toJSON()).toMatchObject({ url: asset.url });
    });
  });

  describe('fromBuffer', () => {
    it('writes the bytes straight to the owned key', async () => {
      const put = vi.fn(async () => undefined);
      const disk = {
        put,
        getVisibility: vi.fn(async () => 'public' as const),
        getUrl: vi.fn(async (key: string) => `https://cdn.example/${key}`),
      } as unknown as Disk;
      const asset = Asset.fromBuffer(Buffer.from('report'), {
        fileName: 'report.pdf',
        extname: 'pdf',
        mimeType: 'application/pdf',
      });

      await asset.initializeAttachment(disk, { folder: 'reports' });

      expect(put).toHaveBeenCalledWith(asset.name, Buffer.from('report'));
      expect(asset.name).toMatch(/^reports\/[0-9a-f-]{36}\.pdf$/);
      expect(asset.persisted).toBe(true);
      expect(asset.size).toBe(6);
      expect(asset.url).toBe(`https://cdn.example/${asset.name}`);
    });
  });
});
