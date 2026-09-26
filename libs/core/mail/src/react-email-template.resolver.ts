import type {
  ResolvedTemplate,
  TemplateResolver,
} from '@nestjs-modules/mailer';

import { emailTemplateNamed, renderEmailTemplate } from './email-template';

/**
 * The mailer's template resolver for React Email.
 *
 * `@nestjs-modules/mailer` calls a resolver when `sendMail` is given a `template` and no `html`, and
 * uses what it returns as the HTML. This one finds the template by the name it was registered under
 * with `defineEmailTemplate` and renders it with the `context` as its props — and a `<name>.txt`, the
 * plain-text rendering `defineEmailTemplate` registers beside it, as plain text, which is what
 * `MailService` resolves a `textTemplate` with.
 */
export class ReactEmailTemplateResolver implements TemplateResolver {
  async resolve(
    templateName: string,
    context: Record<string, unknown> = {},
  ): Promise<ResolvedTemplate> {
    return {
      content: await renderEmailTemplate(
        emailTemplateNamed(templateName),
        context,
      ),
    };
  }
}
