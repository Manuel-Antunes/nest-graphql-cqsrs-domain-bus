import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { MailerOptions } from '@nestjs-modules/mailer';
import { MailerModule } from '@nestjs-modules/mailer';

import { MailSender } from './mail-sender';
import { NestMailerSender } from './nest-mailer.sender';

/** `MailModule`'s own option: whether it is global, which it is unless told otherwise. */
export interface MailModuleExtras {
  isGlobal?: boolean;
}

/** Exactly `@nestjs-modules/mailer`'s options, plus {@link MailModuleExtras}. */
export type MailModuleOptions = MailerOptions & MailModuleExtras;

type MailerAsyncOptions = Parameters<typeof MailerModule.forRootAsync>[0];

/** Exactly `@nestjs-modules/mailer`'s async options, plus {@link MailModuleExtras}. */
export type MailModuleAsyncOptions = Omit<MailerAsyncOptions, 'imports'> &
  Partial<Pick<MailerAsyncOptions, 'imports'>> &
  MailModuleExtras;

const sender: Provider = { provide: MailSender, useClass: NestMailerSender };

/**
 * `@nestjs-modules/mailer`, configured exactly as that module is, plus class-based mail.
 *
 * The options ARE the mailer's — transport, transports, defaults, template (adapter, dir, resolver),
 * plugins, preview — and nothing here chooses any of them. What this module adds is {@link MailSender},
 * which sends a `Mail` through the mailer, and what this library offers beside it is optional:
 * `ReactEmailTemplateResolver` for React Email templates and `plainTextFromHtml` for the text part.
 * A Handlebars adapter, or any other, works as it does with the mailer alone.
 *
 * ```ts
 * MailModule.forRootAsync({
 *   useFactory: () => ({
 *     transport: 'smtp://localhost:1025',
 *     defaults: { from: 'Nest Posts <no-reply@nestposts.local>' },
 *     template: { resolver: new ReactEmailTemplateResolver() },
 *     plugins: [plainTextFromHtml()],
 *   }),
 * })
 * ```
 */
@Module({})
export class MailModule {
  static forRoot({
    isGlobal = true,
    ...options
  }: MailModuleOptions): DynamicModule {
    return {
      module: MailModule,
      global: isGlobal,
      imports: [MailerModule.forRoot(options)],
      providers: [sender],
      exports: [MailSender],
    };
  }

  static forRootAsync({
    isGlobal = true,
    ...options
  }: MailModuleAsyncOptions): DynamicModule {
    return {
      module: MailModule,
      global: isGlobal,
      imports: [
        MailerModule.forRootAsync({
          ...options,
          imports: options.imports ?? [],
        }),
      ],
      providers: [sender],
      exports: [MailSender],
    };
  }
}
