import type { OutboxMessage } from '@nestjs/outbox';

import { TRANSPORT_MESSAGE_TYPE } from './message-headers';
import { OutboxRoute } from './outbox-route';

const messageOf = (messageType: string): OutboxMessage => ({
  id: 'evt-1',
  topic: messageType.split('#')[0],
  key: null,
  headers: { [TRANSPORT_MESSAGE_TYPE]: messageType },
  payload: {},
  createdAt: 0,
  availableAt: 0,
  attempts: 0,
  lastError: null,
});

describe('the outbox route', () => {
  const route = OutboxRoute.over({ posts: 'a transport' });

  it('sends a message through the transport named after its namespace', () => {
    expect(route(messageOf('posts.PostCreated#2.0.0'))).toBe('posts');
  });

  it('sends it local when the outbox has no transport for its namespace', () => {
    expect(route(messageOf('notifications.NotificationReceived#1.0.0'))).toBe(
      OutboxRoute.LOCAL,
    );
  });

  it('sends everything local from an outbox with no transport at all', () => {
    expect(OutboxRoute.over({})(messageOf('posts.PostCreated#2.0.0'))).toBe(
      'local',
    );
  });
});
