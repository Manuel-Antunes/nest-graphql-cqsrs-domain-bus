import { Drive } from '@nestposts/asset/infrastructure/drive/drive';

import type { MinioStorage } from '../../../test/support/minio-storage';
import { startMinioStorage } from '../../../test/support/minio-storage';
import { BucketDisks } from './bucket-disks';

describe('BucketDisks', () => {
  let minio: MinioStorage;
  let disks: BucketDisks;
  let drive: Drive;

  beforeAll(async () => {
    minio = await startMinioStorage();
    disks = new BucketDisks(minio.storage);
    drive = new Drive(disks.createDriveOptions());
  });

  afterAll(async () => {
    disks?.onModuleDestroy();
    await minio?.stop();
  });

  beforeEach(() => minio.drop());

  it('answers with the public disk when none is named', async () => {
    await drive.use().put('default.txt', 'default');

    await expect(drive.use('public').get('default.txt')).resolves.toBe(
      'default',
    );
  });

  it('serves an object under a publicly readable prefix at an unsigned url', async () => {
    await drive.use('public').put('tmp/public.txt', 'public-bytes');

    const response = await fetch(
      await drive.use('public').getUrl('tmp/public.txt'),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('public-bytes');
  });

  it('serves a private object only through a signed url', async () => {
    await drive.use('private').put('private.txt', 'private-bytes');

    const signed = await drive.use('private').getSignedUrl('private.txt');

    expect(signed).toContain('X-Amz-Signature');
    expect((await fetch(signed)).status).toBe(200);
    expect((await fetch(signed.split('?')[0])).status).toBe(403);
  });

  describe('behind a public endpoint that is not its own', () => {
    let exposedDisks: BucketDisks;
    let exposed: Drive;
    let publicEndpoint: string;

    beforeAll(() => {
      const internal = new URL(minio.storage.endpoint as string);
      const outside = new URL(internal);
      outside.hostname =
        internal.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
      publicEndpoint = outside.origin;
      exposedDisks = new BucketDisks({ ...minio.storage, publicEndpoint });
      exposed = new Drive(exposedDisks.createDriveOptions());
    });

    afterAll(() => exposedDisks?.onModuleDestroy());

    it('signs an upload for the public host, and the object lands where the service reads it', async () => {
      const url = await exposed
        .use('private')
        .getSignedUploadUrl('tmp/user-1/upload', { contentType: 'text/plain' });

      expect(url.startsWith(`${publicEndpoint}/`)).toBe(true);
      const put = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'uploaded',
      });
      expect(put.status).toBe(200);
      await expect(
        exposed.use('private').get('tmp/user-1/upload'),
      ).resolves.toBe('uploaded');
    });

    it('signs a read for the public host', async () => {
      await exposed.use('private').put('private.txt', 'private-bytes');

      const url = await exposed.use('private').getSignedUrl('private.txt');

      expect(url.startsWith(`${publicEndpoint}/`)).toBe(true);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('private-bytes');
    });

    it('builds an unsigned url on the public host, path-style', async () => {
      await expect(
        exposed.use('public').getUrl('tmp/public.txt'),
      ).resolves.toBe(
        `${publicEndpoint}/${minio.storage.bucket}/tmp/public.txt`,
      );
    });
  });

  it('keeps the path of a CDN url given without a trailing slash', async () => {
    const cdnDisks = new BucketDisks({
      bucket: 'uploads',
      region: 'us-east-1',
      cdnUrl: 'https://cdn.example/uploads',
    });
    const cdn = new Drive(cdnDisks.createDriveOptions());

    await expect(cdn.use('public').getUrl('posts/cover.png')).resolves.toBe(
      'https://cdn.example/uploads/posts/cover.png',
    );
    cdnDisks.onModuleDestroy();
  });
});
