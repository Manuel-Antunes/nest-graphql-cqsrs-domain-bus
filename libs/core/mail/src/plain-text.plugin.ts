import type { MailerPlugin } from '@nestjs-modules/mailer';
import { plainTextSelectors } from '@react-email/components';
import type { HtmlToTextOptions } from 'html-to-text';
import { convert } from 'html-to-text';

/**
 * A mailer plugin that gives a message with HTML and no text a plain-text part, converted from the
 * HTML — whichever engine produced it: a template resolver, an adapter, or `html` set by hand.
 *
 * It uses React Email's own selectors, so a React Email template reads as React Email's `plainText`
 * render would; `options` go to `html-to-text` and override them.
 *
 * ```ts
 * MailModule.forRoot({ transport, plugins: [plainTextFromHtml()] })
 * ```
 */
export const plainTextFromHtml = (
  options: HtmlToTextOptions = {},
): MailerPlugin => ({
  step: 'compile',
  plugin: (mail: { data: { html?: unknown; text?: unknown } }, callback) => {
    const { html, text } = mail.data;
    if (!text && (typeof html === 'string' || Buffer.isBuffer(html))) {
      mail.data.text = convert(html.toString(), {
        selectors: plainTextSelectors,
        ...options,
      });
    }
    callback();
  },
});
