/** What an inbox entry says about the message, beside `@nestjs/outbox`'s own record of it. */
export interface InboxDescription {
  readonly messageType?: string;
  readonly origin?: string;
}

/**
 * **Where a consumer notes what each message it admitted was, and who produced it** — through the
 * transaction the inbox records it in, so the note and the record commit together.
 *
 * `@nestjs/outbox`'s inbox keeps who processed which message and when; this is what lets an operator,
 * or a suite, also tell a service's own echo from what it ingested. It is optional: without one the
 * inbox deduplicates exactly the same.
 *
 * ```ts
 * TransportEventBusModule.forRoot({
 *   identity: 'tagging',
 *   inbox: { descriptions: MikroOrmOutboxStore },
 * })
 * ```
 */
export abstract class InboxDescriptions {
  abstract describeInbox(
    transaction: unknown,
    consumer: string,
    messageId: string,
    description: InboxDescription,
  ): Promise<void>;
}
