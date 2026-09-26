import { createElement } from 'react';

import { defineEmailTemplate } from './email-template';
import { Mail } from './mail';
import { ReactEmailTemplateResolver } from './react-email-template.resolver';

const Greeting = defineEmailTemplate(
  'spec/mail-greeting',
  ({ name }: { name: string }) => createElement('p', null, `Hello ${name}`),
);

class WelcomeMail extends Mail {
  override subject = 'Welcome';
  override from = { address: 'team@example.com', name: 'The team' };
  override replyTo = 'support@example.com';
  prepared = 0;

  constructor(private readonly recipient: string) {
    super();
  }

  prepare() {
    this.prepared += 1;
    this.message
      .to(this.recipient)
      .htmlView(Greeting, { name: 'Ana' })
      .textView(Greeting.text, { name: 'Ana' });
  }
}

describe('Mail', () => {
  it('applies the subject, the sender and the reply-to before preparing', async () => {
    const message = await new WelcomeMail('ana@example.com').build();

    expect(message.hasSubject('Welcome')).toBe(true);
    expect(message.hasFrom('team@example.com', 'The team')).toBe(true);
    expect(message.hasReplyTo('support@example.com')).toBe(true);
    expect(message.hasTo('ana@example.com')).toBe(true);
    expect(message.hasHtmlView(Greeting)).toBe(true);
    expect(message.hasTextView(Greeting.text)).toBe(true);
    expect(message.toObject().message.html).toBeUndefined();
  });

  it('builds with its views rendered, without sending', async () => {
    const mail = new WelcomeMail('ana@example.com');

    const { message } = (
      await mail.buildWithContents(new ReactEmailTemplateResolver())
    ).toObject();

    expect(message.html).toContain('<p>Hello Ana</p>');
    expect(message.text).toBe('Hello Ana');
    expect(mail.prepared).toBe(1);
  });

  it('prepares once however many times it is built', async () => {
    const mail = new WelcomeMail('ana@example.com');

    await mail.build();
    await mail.build();

    expect(mail.prepared).toBe(1);
    expect(mail.message.toObject().message.to).toEqual(['ana@example.com']);
  });

  it('lets prepare override the subject it was given', async () => {
    class Override extends WelcomeMail {
      override prepare() {
        super.prepare();
        this.message.subject('Changed');
      }
    }

    const message = await new Override('ana@example.com').build();

    expect(message.hasSubject('Changed')).toBe(true);
  });
});
