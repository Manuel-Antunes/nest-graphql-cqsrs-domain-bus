import { Module } from '@nestjs/common';

import type { DriveOptions } from './drive';
import { Drive } from './drive';
import {
  DRIVE_OPTIONS,
  DriveConfigurableModule,
} from './drive.module-definition';

/**
 * Provides the {@link Drive}: the application's disks, by name. The options are flydrive's
 * `DriveManager`'s — `default`, `services`, `fakes` — and the drivers are built by whoever configures
 * it, so a disk can be S3, GCS, the local file system or anything that implements flydrive's
 * `DriverContract`.
 *
 * ```ts
 * DriveModule.forRoot({ default: 'local', services: { local: () => new FSDriver({ … }) } })
 * DriveModule.forRootAsync({ useClass: BucketDisks })    // a DriveOptionsFactory
 * DriveModule.forRootAsync({
 *   inject: [storageConfig.KEY],
 *   useFactory: (storage: StorageConfig) => ({ default: 'public', services: disksOf(storage) }),
 * })
 * ```
 *
 * It is global unless `isGlobal: false`.
 */
@Module({
  providers: [
    {
      provide: Drive,
      useFactory: (options: DriveOptions) => new Drive(options),
      inject: [DRIVE_OPTIONS],
    },
  ],
  exports: [Drive],
})
export class DriveModule extends DriveConfigurableModule {}
