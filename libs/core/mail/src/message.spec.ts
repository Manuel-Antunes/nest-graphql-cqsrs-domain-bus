import { createElement } from 'react';

import { defineEmailTemplate } from './email-template';
import { Message } from './message';
import { ReactEmailTemplateResolver } from './react-email-template.resolver';

const Receipt = defineEmailTemplate(
  'spec/message-receipt',
  ({ total }: { total: number }) => createElement('p', null, `${total}`),
);

describe('Message', () => {
  it('collects recipients with and without names', () => {
    const message = new Message()
      .to('ana@example.com', 'Ana')
      .to('bia@example.com')
      .cc([{ address: 'carl@example.com', name: 'Carl' }, 'dan@example.com'])
      .bcc('eve@example.com');

    expect(message.hasTo('ana@example.com', 'Ana')).toBe(true);
    expect(message.hasTo('ana@example.com', 'Someone else')).toBe(false);
    expect(message.hasTo('bia@example.com')).toBe(true);
    expect(message.hasCc('carl@example.com', 'Carl')).toBe(true);
    expect(message.hasCc('dan@example.com')).toBe(true);
    expect(message.hasBcc('eve@example.com')).toBe(true);
    expect(message.toObject().message.to).toEqual([
      { address: 'ana@example.com', name: 'Ana' },
      'bia@example.com',
    ]);
  });

  it('carries its views by the name the template was registered under', () => {
    const { views } = new Message()
      .htmlView(Receipt, { total: 42 })
      .textView(Receipt.text, { total: 42 })
      .toObject();

    expect(views).toEqual({
      html: { template: 'spec/message-receipt', data: { total: 42 } },
      text: { template: 'spec/message-receipt.txt', data: { total: 42 } },
    });
  });

  it('carries the view of any other engine by the name that engine knows it by', () => {
    const message = new Message()
      .htmlView('receipt', { total: 42 })
      .textView('receipt-text');

    expect(message.toObject().views).toEqual({
      html: { template: 'receipt', data: { total: 42 } },
      text: { template: 'receipt-text', data: {} },
    });
    expect(message.hasHtmlView('receipt')).toBe(true);
    expect(message.hasHtmlView(Receipt)).toBe(false);
    expect(message.hasTextView('receipt-text')).toBe(true);
  });

  it('renders its views in place, the HTML and the plain text of one template', async () => {
    const { message } = (
      await new Message()
        .htmlView(Receipt, { total: 42 })
        .textView(Receipt.text, { total: 7 })
        .computeContents(new ReactEmailTemplateResolver())
    ).toObject();

    expect(message.html).toContain('<p>42</p>');
    expect(message.text).toBe('7');
  });

  it('keeps a body set directly over the view that would render it', async () => {
    const { message, views } = (
      await new Message()
        .html('<p>by hand</p>')
        .htmlView(Receipt, { total: 42 })
        .textView(Receipt.text, { total: 42 })
        .computeContents(new ReactEmailTemplateResolver())
    ).toObject();

    expect(message.html).toBe('<p>by hand</p>');
    expect(message.text).toBe('42');
    expect(views.html?.template).toBe('spec/message-receipt');
  });

  it('renders with whatever resolver it is given, the HTML and the text alike', async () => {
    const { message } = (
      await new Message()
        .htmlView('receipt', { total: 42 })
        .textView('receipt.txt', { total: 7 })
        .computeContents({
          resolve: async (template, context) => ({
            content: `${template}:${context?.total}`,
          }),
        })
    ).toObject();

    expect(message.html).toBe('receipt:42');
    expect(message.text).toBe('receipt.txt:7');
  });

  it('keeps attachments and headers', () => {
    const message = new Message()
      .attachData(Buffer.from('a,b'), { filename: 'report.csv' })
      .embedData('<svg/>', 'logo', { filename: 'logo.svg' })
      .header('X-Campaign', 'launch');

    expect(message.hasAttachment('report.csv')).toBe(true);
    expect(message.hasAttachment('logo.svg')).toBe(true);
    expect(message.hasHeader('X-Campaign', 'launch')).toBe(true);
    expect(message.hasHeader('X-Other')).toBe(false);
  });

  it('builds an iCalendar event whose METHOD is the one the MIME part carries', () => {
    const { icalEvent } = new Message()
      .icalEvent(
        (calendar) =>
          calendar.createEvent({
            id: 'launch@nestposts',
            sequence: 2,
            start: new Date('2026-10-01T14:00:00.000Z'),
            end: new Date('2026-10-01T15:00:00.000Z'),
            summary: 'Launch',
          }),
        { method: 'REQUEST', filename: 'launch.ics' },
      )
      .toObject().message;

    expect(icalEvent).toMatchObject({
      method: 'REQUEST',
      filename: 'launch.ics',
    });
    expect(icalEvent?.content).toContain('METHOD:REQUEST');
    expect(icalEvent?.content).toContain('UID:launch@nestposts');
    expect(icalEvent?.content).toContain('SEQUENCE:2');
    expect(icalEvent?.content).toContain('DTSTART:20261001T140000Z');
  });

  it('takes an iCalendar event as it is, from a file or from a URL', () => {
    expect(
      new Message().icalEvent('BEGIN:VCALENDAR').toObject().message.icalEvent,
    ).toEqual({ content: 'BEGIN:VCALENDAR' });
    expect(
      new Message()
        .icalEventFromFile(new URL('file:///tmp/launch.ics'), {
          method: 'PUBLISH',
        })
        .toObject().message.icalEvent,
    ).toEqual({ path: '/tmp/launch.ics', method: 'PUBLISH' });
    expect(
      new Message()
        .icalEventFromUrl('https://example.com/launch.ics')
        .toObject().message.icalEvent,
    ).toEqual({ href: 'https://example.com/launch.ics' });
  });

  it('hands out a copy, so the data it returns cannot change the message', () => {
    const message = new Message().to('ana@example.com');

    message.toObject().message.to?.push('intruder@example.com');

    expect(message.toObject().message.to).toEqual(['ana@example.com']);
  });
});
