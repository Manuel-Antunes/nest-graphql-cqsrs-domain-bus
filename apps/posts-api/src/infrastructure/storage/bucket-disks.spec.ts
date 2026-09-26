import type { StorageDisk } from '@nestjs/storage';

import type { MinioStorage } from '../../../test/support/minio-storage';
import { startMinioStorage } from '../../../test/support/minio-storage';
import type { BucketStorage } from './bucket-disks';
import {
  BucketDisks,
  MissingStorageCredentialsException,
} from './bucket-disks';

const disksOf = (storage: BucketStorage) =>
  new BucketDisks(storage).createStorageOptions().disks as Record<
    'public' | 'private',
    StorageDisk
  >;

describe('BucketDisks', () => {
  let minio: MinioStorage;
  let disks: Record<'public' | 'private', StorageDisk>;

  beforeAll(async () => {
    minio = await startMinioStorage();
    disks = disksOf(minio.storage);
  });

  afterAll(() => minio?.stop());

  beforeEach(() => minio.drop());

  it('answers with the public disk when none is named', () => {
    expect(new BucketDisks(minio.storage).createStorageOptions().default).toBe(
      'public',
    );
  });

  it('serves an object under a publicly readable prefix at its public url', async () => {
    await disks.public.put('tmp/public.txt', 'public-bytes');

    const response = await fetch(disks.public.url('tmp/public.txt'));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('public-bytes');
  });

  it('serves a private object only through a signed url', async () => {
    await disks.private.put('private.txt', 'private-bytes');

    const signed = await disks.private.signedUrl('private.txt');

    expect(signed).toContain('X-Amz-Signature');
    expect((await fetch(signed)).status).toBe(200);
    expect((await fetch(signed.split('?')[0])).status).toBe(403);
    expect(() => disks.private.url('private.txt')).toThrow();
  });

  describe('behind a public endpoint that is not its own', () => {
    let exposed: Record<'public' | 'private', StorageDisk>;
    let publicEndpoint: string;

    beforeAll(() => {
      const internal = new URL(minio.storage.endpoint as string);
      const outside = new URL(internal);
      outside.hostname =
        internal.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
      publicEndpoint = outside.origin;
      exposed = disksOf({ ...minio.storage, publicEndpoint });
    });

    it('signs an upload for the public host, and the object lands where the service reads it', async () => {
      const upload = await exposed.private.signedUpload('tmp/user-1/upload', {
        contentType: 'text/plain',
      });

      expect(upload.url.startsWith(`${publicEndpoint}/`)).toBe(true);
      const put = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: 'uploaded',
      });
      expect(put.status).toBe(200);
      await expect(exposed.private.getText('tmp/user-1/upload')).resolves.toBe(
        'uploaded',
      );
    });

    it('signs a read for the public host', async () => {
      await exposed.private.put('private.txt', 'private-bytes');

      const url = await exposed.private.signedUrl('private.txt');

      expect(url.startsWith(`${publicEndpoint}/`)).toBe(true);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('private-bytes');
    });

    it('builds an unsigned url on the public host, path-style', () => {
      expect(exposed.public.url('tmp/public.txt')).toBe(
        `${publicEndpoint}/${minio.storage.bucket}/tmp/public.txt`,
      );
    });
  });

  it('builds its disks without credentials, and names the missing ones when the bucket is used', async () => {
    const unconfigured = disksOf({ bucket: 'uploads', region: 'us-east-1' });

    await expect(unconfigured.private.put('a.txt', 'a')).rejects.toThrow(
      MissingStorageCredentialsException,
    );
  });

  it('serves the public disk from a CDN, keeping the path its url carries', () => {
    const cdn = disksOf({
      bucket: 'uploads',
      region: 'us-east-1',
      cdnUrl: 'https://cdn.example/uploads',
    });

    expect(cdn.public.url('posts/cover.png')).toBe(
      'https://cdn.example/uploads/posts/cover.png',
    );
  });
});
