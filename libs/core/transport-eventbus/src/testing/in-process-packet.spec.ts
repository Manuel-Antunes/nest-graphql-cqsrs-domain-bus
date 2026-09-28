import type { OutboxEnvelope, OutboxMessage } from '@nestjs/outbox';

import {
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_TAGS,
} from '../outbound/message-headers';
import { InProcessPacket } from './in-process-packet';

describe('a message sent to a client in this process', () => {
  const envelope: OutboxEnvelope = {
    id: 'evt-1',
    topic: 'posts.PostCreated',
    key: 'posts/p-1',
    createdAt: 1_790_000_000_000,
    headers: {
      [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
      [TRANSPORT_TAGS]: 'postId=p-1',
    },
    payload: { postId: 'p-1' },
  };
  const message = {
    ...envelope,
    availableAt: envelope.createdAt,
    attempts: 0,
    lastError: null,
  } as OutboxMessage;

  it('is the envelope itself, under the routing key read off its headers, whatever the topic says', () => {
    expect(
      InProcessPacket.of({ ...message, topic: 'anything' }, envelope),
    ).toEqual({ pattern: 'posts.PostCreated.p-1', data: envelope });
  });
});
