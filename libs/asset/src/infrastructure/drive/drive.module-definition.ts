import { ConfigurableModuleBuilder } from '@nestjs/common';

import type { DriveOptions } from './drive';

/**
 * A class that builds the drive's options — what `DriveModule.forRootAsync({ useClass })` instantiates,
 * with its own dependencies injected, as `@nestjs-modules/mailer`'s `MailerOptionsFactory` is.
 *
 * ```ts
 * @Injectable()
 * export class BucketDisks implements DriveOptionsFactory {
 *   constructor(@Inject(storageConfig.KEY) private readonly storage: StorageConfig) {}
 *
 *   createDriveOptions(): DriveOptions {
 *     return { default: 'public', services: { public: () => new S3Driver({ … }) } };
 *   }
 * }
 * ```
 */
export interface DriveOptionsFactory {
  createDriveOptions(): DriveOptions | Promise<DriveOptions>;
}

export interface DriveModuleExtras {
  /** Makes the {@link Drive} injectable everywhere once the composition root imported it. On by default. */
  isGlobal: boolean;
}

export const {
  ConfigurableModuleClass: DriveConfigurableModule,
  MODULE_OPTIONS_TOKEN: DRIVE_OPTIONS,
  OPTIONS_TYPE: DRIVE_MODULE_OPTIONS,
  ASYNC_OPTIONS_TYPE: DRIVE_MODULE_ASYNC_OPTIONS,
} = new ConfigurableModuleBuilder<DriveOptions>()
  .setClassMethodName('forRoot')
  .setFactoryMethodName('createDriveOptions')
  .setExtras<DriveModuleExtras>({ isGlobal: true }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();
