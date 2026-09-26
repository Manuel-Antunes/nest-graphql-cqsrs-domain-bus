import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FSDriver } from 'flydrive/drivers/fs';
import type { ObjectVisibility } from 'flydrive/types';

import type { DriveOptions } from '../drive/drive';

const SIGNING_KEY = 'test-drive';

/**
 * A drive on the local file system for a suite that stores real objects without running a storage
 * service: a `public` disk and a `private` one, each a folder of a temporary directory, with URLs
 * under {@link TestDrive.BASE_URL} — plain for the public disk, carrying a signature for the private.
 *
 * ```ts
 * drive = await TestDrive.create();
 * DriveModule.forRoot(drive.options);
 * ```
 */
export class TestDrive {
  static readonly BASE_URL = 'http://files.test';

  private constructor(
    readonly root: string,
    readonly options: DriveOptions,
  ) {}

  static async create(): Promise<TestDrive> {
    const root = await mkdtemp(join(tmpdir(), 'nestposts-test-drive-'));
    return new TestDrive(root, {
      default: 'public',
      services: {
        public: TestDrive.disk(root, 'public', 'public'),
        private: TestDrive.disk(root, 'private', 'private'),
      },
    });
  }

  /** Whether `url` carries the signature the private disk signs with. */
  static isSigned(url: string): boolean {
    const { pathname, searchParams } = new URL(url);
    const [, disk, ...key] = pathname.split('/');
    return (
      searchParams.get('signature') ===
      TestDrive.signatureOf(disk, key.join('/'))
    );
  }

  /** Empties every disk. */
  async drop(): Promise<void> {
    await Promise.all(
      Object.keys(this.options.services).map((disk) =>
        rm(join(this.root, disk), { recursive: true, force: true }),
      ),
    );
  }

  async stop(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  private static disk(
    root: string,
    name: string,
    visibility: ObjectVisibility,
  ): () => FSDriver {
    const url = (key: string) => `${TestDrive.BASE_URL}/${name}/${key}`;
    const signed = (key: string) =>
      `${url(key)}?signature=${TestDrive.signatureOf(name, key)}`;
    return () =>
      new FSDriver({
        location: join(root, name),
        visibility,
        urlBuilder: {
          generateURL: async (key) => url(key),
          generateSignedURL: async (key) => signed(key),
          generateSignedUploadURL: async (key) => signed(key),
        },
      });
  }

  private static signatureOf(disk: string, key: string): string {
    return createHmac('sha256', SIGNING_KEY)
      .update(`${disk}/${key}`)
      .digest('hex');
  }
}
