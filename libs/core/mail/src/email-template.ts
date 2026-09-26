import type { ComponentType } from 'react';
import { createElement } from 'react';
import { render } from 'react-email';

/**
 * A React Email component under a stable name, rendered as HTML or, with React Email's `plainText`,
 * as plain text.
 *
 * The name is what a {@link Message} carries and what the mailer's template resolver is handed, so a
 * message can be built in one process and rendered in another: both import the module that defines
 * the template, and both find it by the same name.
 */
export interface EmailTemplate<
  P extends object,
  PlainText extends boolean = boolean,
> {
  readonly name: string;
  readonly component: ComponentType<P>;
  readonly plainText: PlainText;
}

/**
 * What {@link defineEmailTemplate} returns: the HTML template, and `text`, the same component rendered
 * as plain text — React Email's double rendering — registered under `<name>.txt`, the extension the
 * mailer gives a `textTemplate`.
 */
export interface HtmlEmailTemplate<P extends object>
  extends EmailTemplate<P, false> {
  readonly text: EmailTemplate<P, true>;
}

/** Two components, or two renderings, registered under one name. */
export class EmailTemplateConflictException extends Error {
  constructor(name: string) {
    super(`the email template "${name}" is registered twice`);
    this.name = 'EmailTemplateConflictException';
  }
}

/** A name nothing registered — usually a module that was never imported in this process. */
export class UnknownEmailTemplateException extends Error {
  constructor(name: string) {
    super(
      `no email template is registered as "${name}" — import the module that defines it`,
    );
    this.name = 'UnknownEmailTemplateException';
  }
}

const templates = new Map<string, EmailTemplate<object>>();

const register = <P extends object, PlainText extends boolean>(
  template: EmailTemplate<P, PlainText>,
): EmailTemplate<P, PlainText> => {
  const existing = templates.get(template.name);
  if (
    existing &&
    (existing.component !== template.component ||
      existing.plainText !== template.plainText)
  ) {
    throw new EmailTemplateConflictException(template.name);
  }
  templates.set(template.name, template as unknown as EmailTemplate<object>);
  return template;
};

/**
 * Registers a React Email component under `name`, and its plain-text rendering under `<name>.txt`.
 *
 * ```tsx
 * export const PostCreatedEmail = defineEmailTemplate(
 *   'posts/post-created',
 *   ({ title, url }: PostCreatedEmailProps) => <Html>…</Html>,
 * );
 *
 * this.message.htmlView(PostCreatedEmail, props).textView(PostCreatedEmail.text, props);
 * ```
 *
 * Registering the same component twice is harmless; two components under one name throw
 * {@link EmailTemplateConflictException}, at import time.
 */
export const defineEmailTemplate = <P extends object>(
  name: string,
  component: ComponentType<P>,
): HtmlEmailTemplate<P> => {
  const text = register({ name: `${name}.txt`, component, plainText: true });
  const html: HtmlEmailTemplate<P> = {
    name,
    component,
    plainText: false,
    text,
  };
  register(html);
  return html;
};

/** The template registered under `name`, or {@link UnknownEmailTemplateException}. */
export const emailTemplateNamed = (name: string): EmailTemplate<object> => {
  const template = templates.get(name);
  if (!template) throw new UnknownEmailTemplateException(name);
  return template;
};

/** Renders a template as what it is: HTML, or, for a template's `text`, plain text. */
export const renderEmailTemplate = <P extends object>(
  template: EmailTemplate<P>,
  props: P,
): Promise<string> =>
  render(
    createElement(template.component, props),
    template.plainText ? { plainText: true } : {},
  );
