import type { Readable } from 'node:stream';
import type { Disk } from 'flydrive';

import type { Disks } from '../schemas/disks.schema';

/** The storage port. It is also the DI token `AssetInfrastructureModule` binds. */
export abstract class DiskService {
  /** The named disk, or the configured default one. */
  abstract getDisk(disk?: Disks): Disk;

  /**
   * Uploads a stream whose length is not known up front, such as an archive produced on the fly.
   *
   * `Disk.putStream` cannot: it sends a single `PutObject`, which needs a `Content-Length`, and fails
   * with flydrive's generic `E_CANNOT_WRITE_FILE`.
   */
  abstract uploadStream(
    disk: Disks,
    key: string,
    body: Readable,
    options?: { contentType?: string },
  ): Promise<void>;
}
