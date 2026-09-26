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

  it('renders one component twice: as HTML, and as its plain text', async () => {
    const template = defineEmailTemplate('spec/template-render', Hello);

    await expect(
      renderEmailTemplate(template, { name: 'Ana' }),
    ).resolves.toContain('<p>Hello, Ana</p>');
    await expect(
      renderEmailTemplate(template.text, { name: 'Ana' }),
    ).resolves.toBe('Hello, Ana');
  });

  it('registers the plain text beside the HTML, under the text template’s .txt', () => {
    const template = defineEmailTemplate('spec/template-text', Hello);

    expect(template.text.name).toBe('spec/template-text.txt');
    expect(emailTemplateNamed('spec/template-text.txt')).toBe(template.text);
  });

  it('refuses a name that another template’s plain text already holds', () => {
    defineEmailTemplate('spec/template-owner', Hello);

    expect(() => defineEmailTemplate('spec/template-owner.txt', Hello)).toThrow(
      EmailTemplateConflictException,
    );
  });

  it('resolves a template for the mailer with the context as its props', async () => {
    defineEmailTemplate('spec/template-resolved', Hello);

    const resolved = await new ReactEmailTemplateResolver().resolve(
      'spec/template-resolved',
      { name: 'Bia' },
    );

    expect(resolved.content).toContain('<p>Hello, Bia</p>');
  });

  it('resolves a template’s .txt as its plain text, through the same contract', async () => {
    defineEmailTemplate('spec/template-plain', Hello);

    const resolved = await new ReactEmailTemplateResolver().resolve(
      'spec/template-plain.txt',
      { name: 'Bia' },
    );

    expect(resolved.content).toBe('Hello, Bia');
  });
});
