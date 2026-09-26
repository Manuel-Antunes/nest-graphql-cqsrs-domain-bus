import { Module } from '@nestjs/common';

import { AttachmentConfigurableModule } from './attachment.module-definition';
import type { AttachmentModuleOptions } from './attachment.options';
import { ATTACHMENT_OPTIONS } from './attachment.options';
import { AttachmentManager } from './attachment-manager';
import { AttachmentSubscriber } from './database/attachment.subscriber';
import { AttachmentEventService } from './events/attachment-event.service';
import { AttachmentServer } from './http/attachment-server';
import { AttachmentKeys } from './keys/attachment-keys';
import {
  AttachmentLock,
  InMemoryAttachmentLock,
} from './locking/attachment-lock';
import { ConverterRegistry } from './variants/converter-registry';
import { RegenerateService } from './variants/regenerate.service';
import { VariantService } from './variants/variant.service';
import { VariantGenerator } from './variants/variant-generator';
import { VariantQueue } from './variants/variant-queue';

/**
 * Attachments — `@jrmc/adonis-attachment`, for Nest and MikroORM. It registers the subscriber that
 * runs every `attachment()` column's lifecycle, the converters variants are made with, the queue
 * they are made on, and, optionally, the route that serves attachments by key id.
 *
 * It stores on the disks `@nestjs/storage`'s `StorageModule` provides, and knows nothing about what
 * backs one.
 *
 * ```ts
 * StorageModule.forRoot({ default: 'public', disks: { public: new LocalDisk({ root, publicUrl }) } }),
 * EventEmitterModule.forRoot(),
 * AttachmentModule.forRoot({
 *   preComputeUrl: true,
 *   converters: {
 *     thumbnail: ImageConverter.resize(300).blurhash(),
 *     preview: AutodetectConverter.resize(720),
 *   },
 *   secret: process.env.ATTACHMENT_SECRET,
 *   route: { path: 'attachments', decorators: [AllowAnonymous()] },
 * })
 * ```
 *
 * It needs the MikroORM connection, and is global unless `isGlobal: false`. `EventEmitterModule` is
 * optional: without it, no {@link AttachmentEvent} is emitted.
 */
@Module({
  providers: [
    {
      provide: ConverterRegistry,
      useFactory: (options: AttachmentModuleOptions) =>
        new ConverterRegistry(options.converters),
      inject: [ATTACHMENT_OPTIONS],
    },
    {
      provide: AttachmentKeys,
      useFactory: (options: AttachmentModuleOptions) =>
        new AttachmentKeys(options.secret),
      inject: [ATTACHMENT_OPTIONS],
    },
    {
      provide: VariantQueue,
      useFactory: (options: AttachmentModuleOptions) =>
        new VariantQueue(options.queue?.concurrency ?? 1),
      inject: [ATTACHMENT_OPTIONS],
    },
    {
      provide: AttachmentLock,
      useFactory: (options: AttachmentModuleOptions) =>
        options.lock ?? new InMemoryAttachmentLock(),
      inject: [ATTACHMENT_OPTIONS],
    },
    AttachmentEventService,
    AttachmentManager,
    VariantGenerator,
    VariantService,
    RegenerateService,
    AttachmentServer,
    AttachmentSubscriber,
  ],
  exports: [
    AttachmentManager,
    AttachmentEventService,
    AttachmentServer,
    ConverterRegistry,
    RegenerateService,
    VariantQueue,
    VariantService,
  ],
})
export class AttachmentModule extends AttachmentConfigurableModule {}
