import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { MailerOptions } from '@nestjs-modules/mailer';
import { MAILER_OPTIONS } from '@nestjs-modules/mailer';

/** `MailModule`'s own option: whether it is global, which it is unless told otherwise. */
export interface MailModuleExtras {
  isGlobal?: boolean;
}

export const {
  ConfigurableModuleClass: ConfigurableMailModule,
  OPTIONS_TYPE: MAIL_MODULE_OPTIONS,
  ASYNC_OPTIONS_TYPE: MAIL_MODULE_ASYNC_OPTIONS,
} = new ConfigurableModuleBuilder<MailerOptions>({
  optionsInjectionToken: MAILER_OPTIONS,
})
  .setClassMethodName('forRoot')
  .setFactoryMethodName('createMailerOptions')
  .setExtras<MailModuleExtras>({ isGlobal: true }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();

/** Exactly `@nestjs-modules/mailer`'s options, plus {@link MailModuleExtras}. */
export type MailModuleOptions = typeof MAIL_MODULE_OPTIONS;

/** `useFactory`, `useClass` (a `MailerOptionsFactory`) or `useExisting`, plus {@link MailModuleExtras}. */
export type MailModuleAsyncOptions = typeof MAIL_MODULE_ASYNC_OPTIONS;
