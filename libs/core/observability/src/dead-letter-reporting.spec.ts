import { channel } from 'node:diagnostics_channel';
import { trace } from '@opentelemetry/api';
import { node } from '@opentelemetry/sdk-node';
import type { Event } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';

import {
  DeadLetterReporting,
  OUTBOX_DEAD_LETTERED_CHANNEL,
} from './dead-letter-reporting';
import { startErrorReporting } from './error-reporting';

const STAGED_TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';

const provider = new node.NodeTracerProvider();
const events: Event[] = [];

const deadLettered = {
  type: 'dead-lettered',
  message: {
    id: 'msg-1',
    topic: 'posts.PostCreated.p-1',
    headers: { traceparent: `00-${STAGED_TRACE}-00f067aa0ba902b7-01` },
  },
  error: new Error('the broker refused the message'),
  attempt: 20,
  reason: 'exhausted',
};

describe('DeadLetterReporting', () => {
  const reporting = new DeadLetterReporting();

  beforeAll(() => {
    provider.register();
    vi.stubEnv('LAMBDA_TASK_ROOT', '/var/task');
    startErrorReporting({
      serviceName: 'posts-api',
      dsn: 'https://public@127.0.0.1:9/1',
      environment: 'spec',
    });
    Sentry.getClient()?.on('beforeSendEvent', (event) => events.push(event));
    reporting.onModuleInit();
  });

  afterAll(async () => {
    reporting.onModuleDestroy();
    await Sentry.close(0);
    vi.unstubAllEnvs();
    await provider.shutdown();
    trace.disable();
  });

  beforeEach(() => {
    events.length = 0;
  });

  it('reports a dead letter the outbox announces, with what it was and why it was given up on', async () => {
    channel(OUTBOX_DEAD_LETTERED_CHANNEL).publish(deadLettered);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      level: 'error',
      tags: {
        'outbox.topic': 'posts.PostCreated.p-1',
        'outbox.reason': 'exhausted',
      },
      extra: { 'outbox.message': 'msg-1', 'outbox.attempts': 20 },
    });
    expect(events[0].exception?.values?.[0]?.value).toBe(
      'the broker refused the message',
    );
  });

  it('opens the report in the trace the message was staged in', async () => {
    await reporting.report({
      ...deadLettered,
      error: new Error('the topic does not exist any more'),
    });

    expect(events[0].contexts?.trace?.trace_id).toBe(STAGED_TRACE);
  });

  it('reports a failure that is not an Error as one', async () => {
    await reporting.report({ ...deadLettered, error: 'a string refusal' });

    expect(events[0].exception?.values?.[0]?.value).toBe('a string refusal');
  });
});
