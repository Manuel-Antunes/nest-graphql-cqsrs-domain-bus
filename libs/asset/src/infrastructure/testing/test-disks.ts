import type { DynamicModule } from '@nestjs/common';
import type { Storage, StorageModuleOptions } from '@nestjs/storage';
import { InMemoryDisk, StorageModule } from '@nestjs/storage';

const SIGNING_KEY = 'nestposts-test-disks-signing-key-0123456789';

/**
 * Disks in memory for a suite that stores real objects without running a storage service —
 * `@nestjs/storage`'s `InMemoryDisk`, twice: a `public` disk whose URLs are plain, under
 * {@link TestDisks.BASE_URL}, and a `private` one whose URLs are signed.
 *
 * ```ts
 * imports: [TestDisks.module(), AttachmentModule.forRoot({})]
 * ```
 */
export class TestDisks {
  static readonly BASE_URL = 'http://files.test';

  /** Fresh, empty disks. */
  static options(): Required<StorageModuleOptions> {
    return {
      default: 'public',
      disks: {
        public: new InMemoryDisk({ publicUrl: `${TestDisks.BASE_URL}/public` }),
        private: new InMemoryDisk({
          signedUrls: {
            baseUrl: `${TestDisks.BASE_URL}/private`,
            keys: [SIGNING_KEY],
          },
        }),
      },
    };
  }

  static module(): DynamicModule {
    return StorageModule.forRoot(TestDisks.options());
  }

  /** Empties every disk in memory. */
  static clear(storage: Storage): void {
    for (const name of storage.names()) {
      const disk = storage.disk(name);
      if (disk instanceof InMemoryDisk) {
        disk.clear();
      }
    }
  }

  /** Whether `url` is one the private disk signed, and has not expired. */
  static isSigned(storage: Storage, url: string): boolean {
    try {
      storage.disk('private').verifySignedUrl(url);
      return true;
    } catch {
      return false;
    }
  }
}
