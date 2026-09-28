import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { CommandMessage } from './command-message';
import { EventMessage } from './event-message';
import { Message } from './message';
import { MessageType } from './message-type';

@EventType({ namespace: 'invoices', version: '2.0.0', tags: ['invoiceId'] })
class InvoiceIssuedEvent {
  constructor(
    readonly invoiceId: string,
    readonly occurredAt: Date,
  ) {}
}

class UndeclaredEvent {}

class IssueInvoice {
  constructor(readonly invoiceId: string) {}
}

describe('a message', () => {
  describe('its type', () => {
    it('is the qualified name and the version the event declares', () => {
      const type = MessageType.of(new InvoiceIssuedEvent('i-1', new Date()));

      expect(type.toString()).toBe('invoices.InvoiceIssued#2.0.0');
      expect(type.namespace).toBe('invoices');
      expect(type.localName).toBe('InvoiceIssued');
    });

    it('is the class name, with no namespace and no version, for an event that declares nothing', () => {
      const type = MessageType.of(new UndeclaredEvent());

      expect(type.toString()).toBe('UndeclaredEvent');
      expect(type.namespace).toBe('');
    });

    it('is read back from its string', () => {
      expect(MessageType.parse('invoices.InvoiceIssued#2.0.0')).toEqual(
        new MessageType('invoices.InvoiceIssued', '2.0.0'),
      );
      expect(MessageType.parse('Loose')).toEqual(new MessageType('Loose'));
    });
  });

  describe('an event message', () => {
    it('is the same message for the same event, whoever asks', () => {
      const event = new InvoiceIssuedEvent('i-1', new Date());

      expect(EventMessage.of(event)).toBe(EventMessage.of(event));
      expect(EventMessage.of(event).identifier).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('takes its instant from the event, not from when it was asked', () => {
      const occurredAt = new Date('2026-09-28T10:00:00.000Z');

      expect(
        EventMessage.of(new InvoiceIssuedEvent('i-1', occurredAt)).timestamp,
      ).toEqual(occurredAt);
    });

    it('is another message with more metadata, and that one is what the event answers from then on', () => {
      const event = new InvoiceIssuedEvent('i-1', new Date());
      const before = EventMessage.of(event);

      const after = before.andMetadata({ tenant: 'acme' });

      expect(before.metadata).toEqual({});
      expect(after.metadata).toEqual({ tenant: 'acme' });
      expect(after.identifier).toBe(before.identifier);
      expect(EventMessage.of(event)).toBe(after);
    });

    it('is not made by asking whether there is one', () => {
      const event = new InvoiceIssuedEvent('i-1', new Date());

      expect(EventMessage.attachedTo(event)).toBeUndefined();
      expect(Message.attachedTo(event)).toBeUndefined();
    });

    it('is made from what is already known about it — the wire, the store', () => {
      const event = new InvoiceIssuedEvent('i-1', new Date());

      const message = EventMessage.create(event, {
        identifier: 'evt-1',
        metadata: { correlationId: 'c-1' },
      });

      expect(EventMessage.of(event)).toBe(message);
      expect(message.identifier).toBe('evt-1');
    });
  });

  describe('a command message', () => {
    it('is named after the command, with the metadata it was dispatched with', () => {
      const command = new IssueInvoice('i-1');

      const message = CommandMessage.of(command, { tenant: 'acme' });

      expect(message.type.toString()).toBe('IssueInvoice');
      expect(message.metadata).toEqual({ tenant: 'acme' });
      expect(CommandMessage.of(command)).toBe(message);
    });
  });
});
