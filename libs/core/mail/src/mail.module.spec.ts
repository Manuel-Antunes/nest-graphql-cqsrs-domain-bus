import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

import {
  defineEmailTemplate,
  UnknownEmailTemplateException,
} from './email-template';
import { Mail } from './mail';
import type { MailModuleOptions } from './mail.module';
import { MailModule } from './mail.module';
import { MailSender } from './mail-sender';
import { plainTextFromHtml } from './plain-text.plugin';
import { ReactEmailTemplateResolver } from './react-email-template.resolver';

const Invoice = defineEmailTemplate(
  'spec/module-invoice',
  ({ number }: { number: string }) =>
    createElement(
      'html',
      null,
      createElement(
        'body',
        null,
        createElement('h1', null, `Invoice ${number}`),
      ),
    ),
);

class InvoiceMail extends Mail {
  override subject = 'Your invoice';

  constructor(
    private readonly to: string,
    private readonly template: typeof Invoice | string = Invoice,
  ) {
    super();
  }

  prepare() {
    this.message.to(this.to);
    typeof this.template === 'string'
      ? this.message.view(this.template, { number: 'A-1' })
      : this.message.view(this.template, { number: 'A-1' });
  }
}

const reactEmail: MailModuleOptions = {
  transport: { jsonTransport: true },
  defaults: { from: 'Nest Posts <no-reply@nestposts.test>' },
  template: { resolver: new ReactEmailTemplateResolver() },
  plugins: [plainTextFromHtml()],
};

const sentThrough = async (module: DynamicModule) => {
  const app = await Test.createTestingModule({ imports: [module] }).compile();
  await app.init();
  return { app, sender: app.get(MailSender) };
};

const messageOf = (response: unknown) =>
  JSON.parse(response as string) as {
    from: { address: string; name: string };
    to: { address: string }[];
    subject: string;
    html: string;
    text: string;
  };

describe('MailModule', () => {
  it('sends a mail with the mailer’s options: its transport, its defaults, its resolver', async () => {
    const { app, sender } = await sentThrough(MailModule.forRoot(reactEmail));

    const sent = await sender.send(new InvoiceMail('ana@example.com'));
    const message = messageOf(sent.response);

    expect(message.subject).toBe('Your invoice');
    expect(message.from).toEqual({
      address: 'no-reply@nestposts.test',
      name: 'Nest Posts',
    });
    expect(message.to).toEqual([{ address: 'ana@example.com', name: '' }]);
    expect(message.html).toContain('<h1>Invoice A-1</h1>');
    expect(message.text).toContain('INVOICE A-1');
    expect(sent.envelope.to).toEqual(['ana@example.com']);
    await app.close();
  });

  it('takes the mailer’s options from a factory', async () => {
    const { app, sender } = await sentThrough(
      MailModule.forRootAsync({ useFactory: async () => reactEmail }),
    );

    const sent = await sender.send(new InvoiceMail('bia@example.com'));

    expect(messageOf(sent.response).html).toContain('Invoice A-1');
    await app.close();
  });

  it('renders with whatever engine the mailer was given — Handlebars, here', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mail-templates-'));
    await writeFile(join(dir, 'invoice.hbs'), '<h1>Invoice {{number}}</h1>');
    const { app, sender } = await sentThrough(
      MailModule.forRoot({
        transport: { jsonTransport: true },
        defaults: { from: 'no-reply@nestposts.test' },
        template: {
          dir,
          adapter: new HandlebarsAdapter(undefined, {
            inlineCssEnabled: false,
          }),
        },
        plugins: [plainTextFromHtml()],
      }),
    );

    const sent = await sender.send(
      new InvoiceMail('ana@example.com', 'invoice'),
    );
    const message = messageOf(sent.response);

    expect(message.html).toContain('<h1>Invoice A-1</h1>');
    expect(message.text).toContain('INVOICE A-1');
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to send a React view nothing registered', async () => {
    const { app, sender } = await sentThrough(MailModule.forRoot(reactEmail));

    await expect(
      sender.send(new InvoiceMail('ana@example.com', 'spec/module-missing')),
    ).rejects.toThrow(UnknownEmailTemplateException);
    await app.close();
  });
});
