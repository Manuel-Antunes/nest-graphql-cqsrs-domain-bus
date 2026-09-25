import { S3Client } from '@aws-sdk/client-s3';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { DiskService } from '../domain/storage/disk.service';
import {
  ASSET_STORAGE_OPTIONS,
  AssetInfrastructureConfigurableModule,
} from './asset-infrastructure.module-definition';
import { AssetContextInterceptor } from './interceptors/asset-context.interceptor';
import { AssetContextMiddleware } from './middleware/asset-context.middleware';
import type { AssetStorageOptions } from './storage/asset-storage.options';
import { s3ClientFor } from './storage/asset-storage.options';
import { FlydriveDiskService } from './storage/flydrive-disk.service';

/**
 * Storage for assets, and the lifecycle of the entities that hold them.
 *
 * ```ts
 * AssetInfrastructureModule.forRoot(assetStorageOptionsFromEnv(process.env))
 * AssetInfrastructureModule.forRootAsync({ useFactory: () => ({ bucket: 'uploads' }) })
 * ```
 *
 * It exports the {@link DiskService}, registers the `AssetAttachmentSubscriber` (unless
 * `attachments: false`), and opens the ambient `AssetContext` on every request and message.
 */
@Module({
  providers: [
    {
      provide: S3Client,
      useFactory: (options: AssetStorageOptions) => s3ClientFor(options),
      inject: [ASSET_STORAGE_OPTIONS],
    },
    {
      provide: DiskService,
      useFactory: (options: AssetStorageOptions, client: S3Client) =>
        FlydriveDiskService.from(options, client),
      inject: [ASSET_STORAGE_OPTIONS, S3Client],
    },
    AssetContextMiddleware,
    { provide: APP_INTERCEPTOR, useClass: AssetContextInterceptor },
  ],
  exports: [DiskService],
})
export class AssetInfrastructureModule
  extends AssetInfrastructureConfigurableModule
  implements NestModule
{
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AssetContextMiddleware).forRoutes('*splat');
  }
}
