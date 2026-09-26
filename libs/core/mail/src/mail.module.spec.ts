import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MailerOptions } from '@nestjs-modules/mailer';
import { MailerBatchService, MailerService } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

import {
  defineEmailTemplate,
  UnknownEmailTemplateException,
} from './email-template';
import { Mail } from './mail';
import { MailModule } from './mail.module';
import type { MailModuleOptions } from './mail.module-definition';
import { MailService } from './mail.service';
import { plainTextFromHtml } from './plain-text.plugin';
import { ReactEmailTemplateResolver } from './react-email-template.resolver';
import { CapturingMailService } from './testing/capturing-mail.service';

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
      ? this.message.htmlView(this.template, { number: 'A-1' })
      : this.message.htmlView(this.template, { number: 'A-1' });
  }
}

class DoubleRenderedInvoiceMail extends Mail {
  override subject = 'Your invoice';

  constructor(
    private readonly to: string,
    private readonly renderIn: 'prepare' | 'send',
  ) {
    super();
  }

  async prepare() {
    this.message
      .to(this.to)
      .htmlView(Invoice, { number: 'B-2' })
      .textView(Invoice.text, { number: 'B-2' });
    if (this.renderIn === 'prepare') {
      await this.message.computeContents(new ReactEmailTemplateResolver());
    }
  }
}

const reactEmail: MailModuleOptions = {
  transport: { jsonTransport: true },
  defaults: { from: 'Nest Posts <no-reply@nestposts.test>' },
  template: { resolver: new ReactEmailTemplateResolver() },
  plugins: [plainTextFromHtml()],
};

const reactEmailWithoutPlugin: MailModuleOptions = {
  ...reactEmail,
  plugins: [],
};

const jsonOnly: MailerOptions = {
  transport: { jsonTransport: true },
  defaults: { from: 'no-reply@nestposts.test' },
};

const booted = async (module: DynamicModule) => {
  const app = await Test.createTestingModule({ imports: [module] }).compile();
  await app.init();
  return { app, mailer: app.get(MailService) };
};

const messageOf = (sent: { message: string }) =>
  JSON.parse(sent.message) as {
    from: { address: string; name: string };
    to: { address: string }[];
    subject: string;
    html: string;
    text: string;
  };

describe('MailModule', () => {
  it('sends a mail with the mailer’s options: its transport, its defaults, its resolver', async () => {
    const { app, mailer } = await booted(MailModule.forRoot(reactEmail));

    const sent = await mailer.sendMail(new InvoiceMail('ana@example.com'));
    const message = messageOf(sent);

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

  it('still sends the mailer’s own options', async () => {
    const { app, mailer } = await booted(MailModule.forRoot(reactEmail));

    const sent = await mailer.sendMail({
      to: 'ana@example.com',
      subject: 'Plain',
      template: 'spec/module-invoice',
      context: { number: 'C-3' },
    });

    expect(messageOf(sent).html).toContain('<h1>Invoice C-3</h1>');
    await app.close();
  });

  it('resolves a textTemplate through the resolver, for the mailer’s own options too', async () => {
    const { app, mailer } = await booted(
      MailModule.forRoot(reactEmailWithoutPlugin),
    );

    const sent = await mailer.sendMail({
      to: 'ana@example.com',
      subject: 'Plain',
      template: 'spec/module-invoice',
      textTemplate: 'spec/module-invoice.txt',
      context: { number: 'C-3' },
    });

    expect(messageOf(sent).text).toBe('INVOICE C-3');
    await app.close();
  });

  it('sends the iCalendar event as the message’s text/calendar alternative', async () => {
    class InvitationMail extends Mail {
      prepare() {
        this.message
          .to('ana@example.com')
          .html('<p>You are invited</p>')
          .icalEvent(
            (calendar) =>
              calendar.createEvent({
                id: 'launch@nestposts',
                start: new Date('2026-10-01T14:00:00.000Z'),
                end: new Date('2026-10-01T15:00:00.000Z'),
                summary: 'Launch',
              }),
            { method: 'REQUEST' },
          );
      }
    }
    const { app, mailer } = await booted(MailModule.forRoot(jsonOnly));

    const sent = JSON.parse(
      (await mailer.sendMail(new InvitationMail())).message,
    ) as { icalEvent: { method: string; content: string } };

    expect(sent.icalEvent.method).toBe('REQUEST');
    expect(sent.icalEvent.content).toContain('UID:launch@nestposts');
    await app.close();
  });

  it('gives a mail that names no sender the module’s defaults.from, as it was given, before it is prepared', async () => {
    const seen: unknown[] = [];
    class SenderAware extends Mail {
      prepare() {
        seen.push(this.from);
        this.message.to('ana@example.com').html('<p>Hi</p>');
      }
    }
    class OwnSender extends SenderAware {
      override from = 'team@example.com';
    }
    const { app, mailer } = await booted(MailModule.forRoot(reactEmail));

    const defaulted = messageOf(await mailer.sendMail(new SenderAware()));
    const own = messageOf(await mailer.sendMail(new OwnSender()));

    expect(seen).toEqual([
      'Nest Posts <no-reply@nestposts.test>',
      'team@example.com',
    ]);
    expect(defaulted.from).toEqual({
      address: 'no-reply@nestposts.test',
      name: 'Nest Posts',
    });
    expect(own.from).toEqual({ address: 'team@example.com', name: '' });
    await app.close();
  });

  it('takes the mailer’s options from a factory', async () => {
    const { app, mailer } = await booted(
      MailModule.forRootAsync({ useFactory: async () => reactEmail }),
    );

    const sent = await mailer.sendMail(new InvoiceMail('bia@example.com'));

    expect(messageOf(sent).html).toContain('Invoice A-1');
    await app.close();
  });

  it('is the mailer: MailerService and the batch service send through the same instance', async () => {
    const { app, mailer } = await booted(MailModule.forRoot(reactEmail));

    expect(app.get(MailerService)).toBe(mailer);
    const batch = await app.get(MailerBatchService).sendBatch({
      messages: [{ to: 'ana@example.com', html: '<p>one</p>' }],
    });
    expect(batch.sent).toBe(1);
    await app.close();
  });

  it('takes CapturingMailService in its place, built with the mailer’s own dependencies', async () => {
    const app = await Test.createTestingModule({
      imports: [MailModule.forRoot(reactEmail)],
    })
      .overrideProvider(MailService)
      .useClass(CapturingMailService)
      .compile();
    await app.init();
    const mailer = app.get<MailService, CapturingMailService>(MailService);

    await mailer.sendMail(new InvoiceMail('ana@example.com'));
    await app.get(MailerService).sendMail({
      to: 'bia@example.com',
      html: '<p>through the mailer</p>',
    });

    expect(mailer).toBeInstanceOf(CapturingMailService);
    expect(mailer.sent.map(messageOf).map(({ html }) => html)).toEqual([
      expect.stringContaining('<h1>Invoice A-1</h1>'),
      '<p>through the mailer</p>',
    ]);
    await app.close();
  });

  it('renders the text view at send, through the resolver — React Email’s double rendering', async () => {
    const { app, mailer } = await booted(
      MailModule.forRoot(reactEmailWithoutPlugin),
    );

    const message = messageOf(
      await mailer.sendMail(
        new DoubleRenderedInvoiceMail('ana@example.com', 'send'),
      ),
    );

    expect(message.html).toContain('<h1>Invoice B-2</h1>');
    expect(message.text).toBe('INVOICE B-2');
    await app.close();
  });

  it('sends what prepare already rendered, with no resolver to render it at send', async () => {
    const { app, mailer } = await booted(MailModule.forRoot(jsonOnly));

    const message = messageOf(
      await mailer.sendMail(
        new DoubleRenderedInvoiceMail('ana@example.com', 'prepare'),
      ),
    );

    expect(message.html).toContain('<h1>Invoice B-2</h1>');
    expect(message.text).toBe('INVOICE B-2');
    await app.close();
  });

  it('renders with whatever engine the mailer was given — Handlebars, here', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mail-templates-'));
    await writeFile(join(dir, 'invoice.hbs'), '<h1>Invoice {{number}}</h1>');
    const { app, mailer } = await booted(
      MailModule.forRoot({
        ...jsonOnly,
        template: {
          dir,
          adapter: new HandlebarsAdapter(undefined, {
            inlineCssEnabled: false,
          }),
        },
        plugins: [plainTextFromHtml()],
      }),
    );

    const message = messageOf(
      await mailer.sendMail(new InvoiceMail('ana@example.com', 'invoice')),
    );

    expect(message.html).toContain('<h1>Invoice A-1</h1>');
    expect(message.text).toContain('INVOICE A-1');
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('leaves a text view to the mailer’s own .txt when it has no resolver', async () => {
    class TextedInvoiceMail extends Mail {
      prepare() {
        this.message
          .to('ana@example.com')
          .htmlView('invoice', { number: 'A-1' })
          .textView('invoice', { number: 'A-1' });
      }
    }
    const dir = await mkdtemp(join(tmpdir(), 'mail-templates-'));
    await writeFile(join(dir, 'invoice.hbs'), '<h1>Invoice {{number}}</h1>');
    await writeFile(join(dir, 'invoice.txt'), 'Invoice {{number}}, in text');
    const { app, mailer } = await booted(
      MailModule.forRoot({
        ...jsonOnly,
        template: {
          dir,
          adapter: new HandlebarsAdapter(undefined, {
            inlineCssEnabled: false,
          }),
        },
      }),
    );

    const message = messageOf(await mailer.sendMail(new TextedInvoiceMail()));

    expect(message.html).toContain('<h1>Invoice A-1</h1>');
    expect(message.text).toBe('Invoice A-1, in text');
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to send a React view nothing registered', async () => {
    const { app, mailer } = await booted(MailModule.forRoot(reactEmail));

    await expect(
      mailer.sendMail(
        new InvoiceMail('ana@example.com', 'spec/module-missing'),
      ),
    ).rejects.toThrow(UnknownEmailTemplateException);
    await app.close();
  });
});
