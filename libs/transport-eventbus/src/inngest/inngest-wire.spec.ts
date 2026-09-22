import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { InngestEventEnvelopeDeserializer } from '../inbound/deserializers/inngest-event-envelope.deserializer';
import {
  type EnvelopeMetadata,
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
} from '../outbound/event-envelope';
import {
  CORRELATION_SESSION,
  type InngestEventMessage,
  InngestEventEnvelopeSerializer,
} from '../outbound/serializers/inngest-event-envelope.serializer';
import { CORRELATION_ID } from '../request-context';
import { InngestClientProxy } from './inngest-client.proxy';
import { InngestRecordBuilder } from './inngest-record.builder';
import { MAX_TRIGGERS, inngestFunctionId, inngestTriggers } from './inngest-triggers';

const ROUTING_KEY = 'posts.PostCreated.p-1';

const SPEC_NAMESPACE = 'inngestwire';

@EventType({ namespace: SPEC_NAMESPACE, name: 'Born', tags: ['postId'] })
class BornEvent {
  constructor(readonly postId: string) {}
}

@EventType({ namespace: SPEC_NAMESPACE, name: 'Completed', tags: ['postId'] })
class CompletedEvent {
  constructor(readonly postId: string) {}
}

const metadata: EnvelopeMetadata = {
  [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
  [TRANSPORT_IDENTIFIER]: 'evt-1',
  [TRANSPORT_ORIGIN]: 'tagging',
  [TRANSPORT_TAGS]: 'postId=p-1',
  [CORRELATION_ID]: 'corr-1',
  'x-tenant': 'acme',
};

const publish = (data: object, envelopeMetadata: EnvelopeMetadata = metadata): InngestEventMessage =>
  new InngestEventEnvelopeSerializer().serialize({
    pattern: ROUTING_KEY,
    data: new EventEnvelope(data, envelopeMetadata),
  }) as InngestEventMessage;

class FakeInngest {
  readonly sent: Record<string, unknown>[] = [];

  send(payload: Record<string, unknown>): Promise<void> {
    this.sent.push(payload);
    return Promise.resolve();
  }
}

const proxyOn = (inngest: FakeInngest) =>
  new InngestClientProxy({
    inngest: inngest as never,
    serializer: new InngestEventEnvelopeSerializer(),
  });

const emit = async (inngest: FakeInngest, data: unknown): Promise<Record<string, unknown>> => {
  const proxy = proxyOn(inngest);
  await (proxy as unknown as {
    dispatchEvent: (packet: { pattern: string; data: unknown }) => Promise<void>;
  }).dispatchEvent({ pattern: ROUTING_KEY, data });
  return inngest.sent[0]!;
};

describe('the Inngest wire', () => {
  describe('what the client is given', () => {
    it('names the event by its QUALIFIED name, because a trigger has no wildcards', () => {
      expect(publish({ postId: 'p-1' }).name).toBe('posts.PostCreated');
    });

    it('carries the metadata as the event user, which is what headers are here', () => {
      expect(publish({ postId: 'p-1' }).user).toMatchObject({
        [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
        [TRANSPORT_TAGS]: 'postId=p-1',
        'x-tenant': 'acme',
      });
    });

    it('groups the whole request under one session, from the correlation id', () => {
      expect(publish({ postId: 'p-1' }).meta?.sessions).toEqual({ [CORRELATION_SESSION]: 'corr-1' });
    });

    it('leaves the sessions out when there is no correlation to group by', () => {
      const { [CORRELATION_ID]: _correlation, ...rest } = metadata;

      expect(publish({ postId: 'p-1' }, rest).meta).toBeUndefined();
    });
  });

  describe('and what comes back', () => {
    it('reads the data and the metadata back where this transport put them', () => {
      const message = publish({ postId: 'p-1', title: 'Nest' });

      const incoming = new InngestEventEnvelopeDeserializer().deserialize(
        JSON.parse(JSON.stringify(message)) as unknown,
        { channel: 'posts.#' },
      ) as { pattern: string; data: EventEnvelope<Record<string, unknown>> };

      expect(incoming.pattern).toBe('posts.#');
      expect(incoming.data.data).toMatchObject({ postId: 'p-1', title: 'Nest' });
      expect(incoming.data.metadata).toMatchObject({ 'x-tenant': 'acme', [CORRELATION_ID]: 'corr-1' });
    });
  });

  describe('a record, which is how a caller says more', () => {
    it('sends no id when nothing asked for one: every send is a fresh run', async () => {
      const sent = await emit(new FakeInngest(), new EventEnvelope({ postId: 'p-1' }, metadata));

      expect(sent.id).toBeUndefined();
    });

    it('turns an idempotency key into the event id, so two sends are one run', async () => {
      const sent = await emit(
        new FakeInngest(),
        new InngestRecordBuilder(new EventEnvelope({ postId: 'p-1' }, metadata))
          .setIdempotencyKey('complete-p-1')
          .build(),
      );

      expect(sent.id).toBe('posts.PostCreated:complete-p-1');
    });

    it('adds user entries and extra metadata to what the envelope already carries', async () => {
      const sent = await emit(
        new FakeInngest(),
        new InngestRecordBuilder(new EventEnvelope({ postId: 'p-1' }, metadata))
          .setUser({ 'x-forwarded-for': '10.0.0.1' })
          .setMetadata({ 'x-tenant': 'other' })
          .build(),
      );

      expect(sent.user).toMatchObject({
        [TRANSPORT_IDENTIFIER]: 'evt-1',
        'x-forwarded-for': '10.0.0.1',
        'x-tenant': 'other',
      });
    });

    it('adds a session of its own beside the correlation one', async () => {
      const sent = await emit(
        new FakeInngest(),
        new InngestRecordBuilder(new EventEnvelope({ postId: 'p-1' }, metadata))
          .setSession('conversation_id', 'conv-1')
          .build(),
      );

      expect(sent.meta).toEqual({
        sessions: { [CORRELATION_SESSION]: 'corr-1', conversation_id: 'conv-1' },
      });
    });

    it('refuses more sessions than Inngest takes, where the builder can still say which', () => {
      const builder = new InngestRecordBuilder({});

      expect(() =>
        builder.setSessions({ a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' }),
      ).toThrow(/at most 5 sessions/);
    });
  });

  describe('a binding, as the names Inngest can trigger on', () => {
    it('expands a namespace into one trigger per event of it the process has REGISTERED', () => {
      void BornEvent;
      void CompletedEvent;

      const triggers = inngestTriggers(`${SPEC_NAMESPACE}.#`);

      expect(triggers).toEqual([`${SPEC_NAMESPACE}.Born`, `${SPEC_NAMESPACE}.Completed`]);
      expect(triggers.length).toBeLessThanOrEqual(MAX_TRIGGERS);
    });

    it('drops the aggregate segment of a single type, which is the wildcard a queue would match', () => {
      expect(inngestTriggers('posts.PostCreated.*')).toEqual(['posts.PostCreated']);
    });

    it('leaves a literal name alone', () => {
      expect(inngestTriggers('posts.PostCreated')).toEqual(['posts.PostCreated']);
    });

    it('answers nothing for a namespace nobody registered, which is what makes the warning possible', () => {
      expect(inngestTriggers('nowhere.#')).toEqual([]);
    });

    it('derives a function id a URL can carry', () => {
      expect(inngestFunctionId('posts.#')).toBe('posts');
      expect(inngestFunctionId('posts.PostCreated.*')).toBe('posts-postcreated');
    });
  });
});
