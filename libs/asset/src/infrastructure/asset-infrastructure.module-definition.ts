import { ConfigurableModuleBuilder } from '@nestjs/common';

import { AssetAttachmentSubscriber } from './database/subscribers/asset-attachment.subscriber';
import type { AssetStorageOptions } from './storage/asset-storage.options';

export interface AssetInfrastructureModuleExtras {
  /**
   * Registers the `AssetAttachmentSubscriber`, which runs the lifecycle of every `attachment()`
   * column and therefore needs the MikroORM connection. On by default; a service that only needs
   * the `DiskService` turns it off.
   */
  attachments: boolean;
  /**
   * Makes the module global, so the `DiskService` is injectable wherever it is needed once the
   * composition root has called `forRoot`. On by default.
   */
  isGlobal: boolean;
}

export const {
  ConfigurableModuleClass: AssetInfrastructureConfigurableModule,
  MODULE_OPTIONS_TOKEN: ASSET_STORAGE_OPTIONS,
  OPTIONS_TYPE: ASSET_INFRASTRUCTURE_OPTIONS,
  ASYNC_OPTIONS_TYPE: ASSET_INFRASTRUCTURE_ASYNC_OPTIONS,
} = new ConfigurableModuleBuilder<AssetStorageOptions>()
  .setClassMethodName('forRoot')
  .setExtras<AssetInfrastructureModuleExtras>(
    { attachments: true, isGlobal: true },
    (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
      providers: [
        ...(definition.providers ?? []),
        ...(extras.attachments ? [AssetAttachmentSubscriber] : []),
      ],
    }),
  )
  .build();
