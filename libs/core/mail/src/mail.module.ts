import { Module } from '@nestjs/common';
import {
  MailerBatchService,
  MailerEventService,
  MailerHealthIndicator,
  MailerService,
} from '@nestjs-modules/mailer';

import { ConfigurableMailModule } from './mail.module-definition';
import { MailService } from './mail.service';

/**
 * `@nestjs-modules/mailer`'s module, configured exactly as that one is, whose `MailerService` is
 * {@link MailService}: the mailer, sending class-based mail as well.
 *
 * The options ARE the mailer's — transport, transports, defaults, template (adapter, dir, resolver),
 * plugins, preview, i18n — provided under its own `MAILER_OPTIONS`, and nothing here chooses any of
 * them. It provides what `MailerModule` does — `MailerService`, `MailerBatchService`,
 * `MailerEventService`, `MailerHealthIndicator` — with `MailerService` bound to the one `MailService`,
 * so injecting either reaches the same transporters. It replaces `MailerModule` rather than sitting
 * beside it, where each would build transporters of its own.
 *
 * What this library offers beside it is optional: `ReactEmailTemplateResolver` renders React Email
 * templates, as HTML and as plain text, and `plainTextFromHtml` writes the text part of a message that
 * has none.
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
@Module({
  providers: [
    MailerEventService,
    MailService,
    { provide: MailerService, useExisting: MailService },
    MailerBatchService,
    MailerHealthIndicator,
  ],
  exports: [
    MailService,
    MailerService,
    MailerBatchService,
    MailerEventService,
    MailerHealthIndicator,
  ],
})
export class MailModule extends ConfigurableMailModule {}
