import { createElement } from 'react';

import {
  defineEmailTemplate,
  EmailTemplateConflictException,
  emailTemplateNamed,
  renderEmailTemplate,
  UnknownEmailTemplateException,
} from './email-template';
import { ReactEmailTemplateResolver } from './react-email-template.resolver';

const Hello = ({ name }: { name: string }) =>
  createElement('p', null, `Hello, ${name}`);

describe('email templates', () => {
  it('finds a template by the name it was registered under', () => {
    const template = defineEmailTemplate('spec/template-hello', Hello);

    expect(emailTemplateNamed('spec/template-hello')).toBe(template);
  });

  it('accepts the same component registered twice', () => {
    defineEmailTemplate('spec/template-twice', Hello);

    expect(() =>
      defineEmailTemplate('spec/template-twice', Hello),
    ).not.toThrow();
  });

  it('refuses two components under one name', () => {
    defineEmailTemplate('spec/template-taken', Hello);

    expect(() =>
      defineEmailTemplate('spec/template-taken', () => createElement('p')),
    ).toThrow(EmailTemplateConflictException);
  });

  it('refuses a name nothing registered', () => {
    expect(() => emailTemplateNamed('spec/never-registered')).toThrow(
      UnknownEmailTemplateException,
    );
  });

  it('renders the HTML and the plain text of one template', async () => {
    const template = defineEmailTemplate('spec/template-render', Hello);

    await expect(
      renderEmailTemplate(template, { name: 'Ana' }),
    ).resolves.toContain('<p>Hello, Ana</p>');
    await expect(
      renderEmailTemplate(template, { name: 'Ana' }, { plainText: true }),
    ).resolves.toBe('Hello, Ana');
  });

  it('resolves a template for the mailer with the context as its props', async () => {
    defineEmailTemplate('spec/template-resolved', Hello);

    const resolved = await new ReactEmailTemplateResolver().resolve(
      'spec/template-resolved',
      { name: 'Bia' },
    );

    expect(resolved.content).toContain('<p>Hello, Bia</p>');
  });
});
