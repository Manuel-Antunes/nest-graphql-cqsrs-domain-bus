import type { ComponentType } from 'react';
import { createElement } from 'react';
import { render } from '@react-email/components';

/**
 * A React Email component under a stable name.
 *
 * The name is what a {@link Message} carries and what the mailer's template resolver is handed, so a
 * message can be built in one process and rendered in another: both import the module that defines
 * the template, and both find it by the same name.
 */
export interface EmailTemplate<P extends object> {
  readonly name: string;
  readonly component: ComponentType<P>;
}

/** Two components registered under one name. */
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

/**
 * Registers a React Email component under `name`.
 *
 * ```tsx
 * export const PostCreatedEmail = defineEmailTemplate(
 *   'posts/post-created',
 *   ({ title, url }: PostCreatedEmailProps) => <Html>…</Html>,
 * );
 * ```
 *
 * Registering the same component twice is harmless; two components under one name throw
 * {@link EmailTemplateConflictException}, at import time.
 */
export const defineEmailTemplate = <P extends object>(
  name: string,
  component: ComponentType<P>,
): EmailTemplate<P> => {
  const existing = templates.get(name);
  if (existing && existing.component !== component) {
    throw new EmailTemplateConflictException(name);
  }
  const template: EmailTemplate<P> = { name, component };
  templates.set(name, template as unknown as EmailTemplate<object>);
  return template;
};

/** The template registered under `name`, or {@link UnknownEmailTemplateException}. */
export const emailTemplateNamed = (name: string): EmailTemplate<object> => {
  const template = templates.get(name);
  if (!template) throw new UnknownEmailTemplateException(name);
  return template;
};

/** Renders a template to HTML, or to its plain-text alternative. */
export const renderEmailTemplate = <P extends object>(
  template: EmailTemplate<P>,
  props: P,
  { plainText = false }: { plainText?: boolean } = {},
): Promise<string> =>
  render(createElement(template.component, props), { plainText });
