import { ConfigurableModuleBuilder } from '@nestjs/common';

import type {
  AttachmentModuleExtras,
  AttachmentModuleOptions,
} from './attachment.options';
import { ATTACHMENT_OPTIONS } from './attachment.options';
import { AttachmentContextModule } from './context/attachment-context.module';
import { AttachmentsController } from './http/attachments.controller';

export const {
  ConfigurableModuleClass: AttachmentConfigurableModule,
  OPTIONS_TYPE: ATTACHMENT_MODULE_OPTIONS,
  ASYNC_OPTIONS_TYPE: ATTACHMENT_MODULE_ASYNC_OPTIONS,
} = new ConfigurableModuleBuilder<AttachmentModuleOptions>({
  optionsInjectionToken: ATTACHMENT_OPTIONS,
})
  .setClassMethodName('forRoot')
  .setExtras<AttachmentModuleExtras>(
    { isGlobal: true, context: true, route: false },
    (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
      imports: [
        ...(definition.imports ?? []),
        ...(extras.context ? [AttachmentContextModule] : []),
      ],
      controllers: [
        ...(definition.controllers ?? []),
        ...(extras.route ? [AttachmentsController.at(extras.route)] : []),
      ],
    }),
  )
  .build();
