import type { ExecutionContext } from '@nestjs/common';
import { context, propagation, trace } from '@opentelemetry/api';
import { node } from '@opentelemetry/sdk-node';

import {
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
} from '../outbound/event-envelope';
import { IncomingRequest } from './incoming-request';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN = '00f067aa0ba902b7';

const provider = new node.NodeTracerProvider();

const delivering = (data: unknown, type = 'rpc'): ExecutionContext =>
  ({
    getType: () => type,
    switchToRpc: () => ({ getData: () => data, getContext: () => ({}) }),
  }) as unknown as ExecutionContext;

const envelope = (metadata: Record<string, string>) => ({
  data: { postId: 'p-1' },
  metadata: {
    [TRANSPORT_MESSAGE_TYPE]: 'posts.PostPreCreated#1.0.0',
    [TRANSPORT_IDENTIFIER]: 'message-1',
    [TRANSPORT_ORIGIN]: 'posts-api',
    ...metadata,
  },
});

describe('IncomingRequest.traceOf', () => {
  beforeAll(() => provider.register());

  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('answers the trace the message was published in', () => {
    const traced = IncomingRequest.traceOf(
      delivering(envelope({ traceparent: `00-${TRACE}-${SPAN}-01` })),
    );

    expect(traced && trace.getSpanContext(traced)).toMatchObject({
      traceId: TRACE,
      spanId: SPAN,
      isRemote: true,
    });
  });

  it('answers nothing for what is not a message', () => {
    expect(IncomingRequest.traceOf(delivering({}, 'http'))).toBeUndefined();
    expect(
      IncomingRequest.traceOf(delivering('not an envelope')),
    ).toBeUndefined();
  });
});
