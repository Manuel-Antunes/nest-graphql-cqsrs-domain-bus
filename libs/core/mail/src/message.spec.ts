import { createElement } from 'react';

import { defineEmailTemplate } from './email-template';
import { Message } from './message';

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

  it('carries its view by the name the template was registered under', () => {
    const { view } = new Message().view(Receipt, { total: 42 }).toObject();

    expect(view).toEqual({
      template: 'spec/message-receipt',
      context: { total: 42 },
    });
  });

  it('carries the view of any other engine by the name that engine knows it by', () => {
    const message = new Message().view('receipt', { total: 42 });

    expect(message.toObject().view).toEqual({
      template: 'receipt',
      context: { total: 42 },
    });
    expect(message.hasView('receipt')).toBe(true);
    expect(message.hasView(Receipt)).toBe(false);
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

  it('hands out a copy, so the data it returns cannot change the message', () => {
    const message = new Message().to('ana@example.com');

    message.toObject().message.to?.push('intruder@example.com');

    expect(message.toObject().message.to).toEqual(['ana@example.com']);
  });
});
