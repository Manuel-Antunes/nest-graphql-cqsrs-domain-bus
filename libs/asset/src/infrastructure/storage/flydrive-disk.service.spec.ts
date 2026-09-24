import { Readable } from 'node:stream';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { Asset } from '../../domain/data-objects/asset';
import { publishDownload } from '../../domain/downloads/publish-download';
import type { Disks } from '../../domain/schemas/disks.schema';
import { DiskService } from '../../domain/storage/disk.service';
import { AssetInfrastructureModule } from '../asset-infrastructure.module';
import type { TestStorage } from '../testing/test-storage';
import { setupTestStorage } from '../testing/test-storage';
import { s3ClientFor } from './asset-storage.options';
import { FlydriveDiskService } from './flydrive-disk.service';

describe('FlydriveDiskService', () => {
  let storage: TestStorage;
  let moduleRef: TestingModule;
  let disks: DiskService;

  beforeAll(async () => {
    storage = await setupTestStorage();
    moduleRef = await Test.createTestingModule({
      imports: [
        AssetInfrastructureModule.forRoot({
          ...storage.options,
          attachments: false,
        }),
      ],
    }).compile();
    await moduleRef.init();
    disks = moduleRef.get(DiskService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await storage?.stop();
  });

  beforeEach(() => storage.drop());

  it('answers with the public disk when none is named', async () => {
    await disks.getDisk().put('default.txt', 'default');

    await expect(disks.getDisk('public').get('default.txt')).resolves.toBe(
      'default',
    );
  });

  it('refuses a disk it does not have', () => {
    expect(() => disks.getDisk('shared' as Disks)).toThrow(
      /Disk shared not found/,
    );
  });

  it('serves an object under a publicly readable prefix at an unsigned url', async () => {
    await disks.getDisk('public').put('tmp/public.txt', 'public-bytes');

    const response = await fetch(
      await disks.getDisk('public').getUrl('tmp/public.txt'),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('public-bytes');
  });

  it('serves a private object only through a signed url', async () => {
    const disk = disks.getDisk('private');
    await disk.put('private.txt', 'private-bytes');

    const signed = await fetch(await disk.getSignedUrl('private.txt'));
    const unsigned = await fetch(await disk.getUrl('private.txt'));

    expect(signed.status).toBe(200);
    await expect(signed.text()).resolves.toBe('private-bytes');
    expect(unsigned.status).toBe(403);
  });

  it('uploads a stream whose length it cannot know up front', async () => {
    const chunks = async function* () {
      for (let part = 0; part < 3; part++) {
        yield Buffer.from(`part-${part};`);
      }
    };

    await disks.uploadStream(
      'private',
      'archives/export.txt',
      Readable.from(chunks()),
      {
        contentType: 'text/plain',
      },
    );

    const disk = disks.getDisk('private');
    await expect(disk.get('archives/export.txt')).resolves.toBe(
      'part-0;part-1;part-2;',
    );
    await expect(
      disk.getMetaData('archives/export.txt'),
    ).resolves.toMatchObject({
      contentType: 'text/plain',
    });
  });

  it('publishes a download under an unguessable key, at a short unsigned url', async () => {
    const download = await publishDownload(
      disks.getDisk('public'),
      'report.txt',
      Buffer.from('report'),
      'text/plain',
    );

    expect(download.key).toMatch(/^tmp\/downloads\/[\w-]{22}\/report\.txt$/);
    expect(download.url).not.toContain('X-Amz-Signature');
    expect(download.sizeBytes).toBe(6);
    const response = await fetch(download.url);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('report');
  });

  it('promotes the bytes of a remote url once attached', async () => {
    await disks.getDisk('public').put('remote/source.txt', 'remote-bytes');
    const asset = Asset.fromUrl(
      await disks.getDisk('public').getSignedUrl('remote/source.txt'),
      'downloads',
      'remote',
    );

    await asset.initializeAttachment(disks.getDisk('public'), {
      folder: 'owned',
    });

    expect(asset.persisted).toBe(true);
    expect(asset.name).toMatch(/^owned\/[0-9a-f-]{36}\.plain$/);
    expect(asset.mimeType).toBe('text/plain');
    await expect(disks.getDisk('public').get(asset.name)).resolves.toBe(
      'remote-bytes',
    );
  });

  it('refuses to attach a remote url that does not answer', async () => {
    const asset = Asset.fromUrl(
      `${storage.options.endpoint}/${storage.options.bucket}/missing.txt`,
    );

    await expect(
      asset.initializeAttachment(disks.getDisk('public')),
    ).rejects.toThrow(/Could not download/);
    expect(asset.persisted).toBe(false);
  });

  describe('behind a public endpoint that is not its own', () => {
    let exposed: FlydriveDiskService;
    let publicEndpoint: string;

    beforeAll(() => {
      const internal = new URL(storage.options.endpoint as string);
      const outside = new URL(internal);
      outside.hostname =
        internal.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
      publicEndpoint = outside.origin;
      const options = { ...storage.options, publicEndpoint };
      exposed = FlydriveDiskService.from(options, s3ClientFor(options));
    });

    afterAll(() => exposed?.onModuleDestroy());

    it('signs an upload for the public host, and the object lands where the service reads it', async () => {
      const url = await exposed
        .getDisk('private')
        .getSignedUploadUrl('tmp/user-1/upload', { contentType: 'text/plain' });

      expect(url.startsWith(`${publicEndpoint}/`)).toBe(true);
      const put = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'uploaded',
      });
      expect(put.status).toBe(200);
      await expect(
        exposed.getDisk('private').get('tmp/user-1/upload'),
      ).resolves.toBe('uploaded');
    });

    it('signs a read for the public host', async () => {
      await exposed.getDisk('private').put('private.txt', 'private-bytes');

      const url = await exposed.getDisk('private').getSignedUrl('private.txt');

      expect(url.startsWith(`${publicEndpoint}/`)).toBe(true);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('private-bytes');
    });

    it('builds an unsigned url on the public host, path-style', async () => {
      await expect(
        exposed.getDisk('public').getUrl('tmp/public.txt'),
      ).resolves.toBe(
        `${publicEndpoint}/${storage.options.bucket}/tmp/public.txt`,
      );
    });
  });

  it('keeps the path of a CDN url given without a trailing slash', async () => {
    const options = {
      bucket: 'uploads',
      region: 'us-east-1',
      cdnUrl: 'https://cdn.example/uploads',
    };
    const service = FlydriveDiskService.from(options, s3ClientFor(options));

    await expect(
      service.getDisk('public').getUrl('posts/cover.png'),
    ).resolves.toBe('https://cdn.example/uploads/posts/cover.png');
    service.onModuleDestroy();
  });
});
