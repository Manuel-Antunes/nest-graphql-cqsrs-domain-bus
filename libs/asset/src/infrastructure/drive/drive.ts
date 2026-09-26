import type { Disk } from 'flydrive';
import { DriveManager } from 'flydrive';
import type { DriveManagerOptions, DriverContract } from 'flydrive/types';

/** The disks a drive holds, each a factory of a flydrive driver — `FSDriver`, `S3Driver`, `GCSDriver`, or one of your own. */
export type DriveServices = Record<string, () => DriverContract>;

/** What a drive is made of: the disks by name, which one answers when none is named, and where fakes live. */
export interface DriveOptions {
  default: string;
  services: DriveServices;
  fakes?: DriveManagerOptions<DriveServices>['fakes'];
}

/**
 * Every disk the application stores files on, by name — flydrive's `DriveManager`, which is what
 * `@adonisjs/drive` is too. Nothing here knows what a disk is backed by: the composition root builds
 * the drivers, with whatever rules its provider has, and this only hands them out.
 *
 * ```ts
 * DriveModule.forRoot({
 *   default: 'public',
 *   services: {
 *     public: () => new S3Driver({ client, bucket, visibility: 'public' }),
 *     private: () => new S3Driver({ client, bucket, visibility: 'private' }),
 *     local: () => new FSDriver({ location: new URL('./storage', import.meta.url), visibility: 'public' }),
 *   },
 * })
 *
 * constructor(private readonly drive: Drive) {}
 * await this.drive.use('private').getSignedUploadUrl(key);
 * ```
 *
 * With `fakes` configured, `drive.fake('public')` swaps a disk for a local one until `restore`.
 */
export class Drive extends DriveManager<DriveServices> {
  /** The name of the disk {@link use} answers with when none is named. */
  readonly defaultDisk: string;

  readonly disks: readonly string[];

  constructor(options: DriveOptions) {
    super(options);
    this.defaultDisk = options.default;
    this.disks = Object.keys(options.services);
  }

  override use(disk?: string): Disk {
    return super.use(disk ?? this.defaultDisk);
  }
}
