import type { MikroORM } from '@mikro-orm/core';
import { metadataOnly } from '@nestposts/database/testing';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { ChatEntitySchema } from '../../infrastructure/persistence/entities/chat-orm.entity';
import { Chat } from './chat.entity';
import { ChatOfAnotherAgentException } from './exception/chat-of-another-agent.exception';
import { AgentId } from './vo/agent-id';
import { ChatId } from './vo/chat-id';
import { ChatTitle } from './vo/chat-title';

describe('Chat', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await metadataOnly([
      ChatEntitySchema,
      UserEntitySchema,
      AuthorshipEntitySchema,
    ]);
  });

  afterAll(() => orm.close());

  const id = ChatId.parse('6d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b');
  const ana = UserId.parse('user-ana');
  const theo = AgentId.parse('theo');
  const opened = new Date('2026-10-02T12:00:00.000Z');
  const later = new Date('2026-10-02T12:30:00.000Z');

  const started = (title: ChatTitle | null = ChatTitle.parse('Who am I?')) =>
    Chat.start({ id, owner: ana, agentId: theo, title }, opened);

  it('is started for one person and one agent, its id the agent’s thread', () => {
    const chat = started();

    expect(chat.id.equals(id)).toBe(true);
    expect(chat.threadId).toBe('6d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b');
    expect(chat.agentId.equals(theo)).toBe(true);
    expect(chat.title?.value).toBe('Who am I?');
    expect(chat.createdAt).toEqual(opened);
    expect(chat.updatedAt).toEqual(opened);
  });

  it('belongs to whoever started it, and to nobody else', () => {
    const chat = started();

    expect(chat.isOwnedBy(UserId.parse('user-ana'))).toBe(true);
    expect(chat.isOwnedBy(UserId.parse('user-bia'))).toBe(false);
  });

  it('keeps the title it has when the conversation goes on, and moves to the top', () => {
    const chat = started().continueWith(
      theo,
      ChatTitle.parse('Something else entirely'),
      later,
    );

    expect(chat.title?.value).toBe('Who am I?');
    expect(chat.updatedAt).toEqual(later);
    expect(chat.createdAt).toEqual(opened);
  });

  it('takes a title when it went on without one', () => {
    const chat = started(null).continueWith(
      theo,
      ChatTitle.parse('What did I write last week?'),
      later,
    );

    expect(chat.title?.value).toBe('What did I write last week?');
  });

  it('is one agent’s thread: another agent cannot go on with it', () => {
    const chat = started();

    expect(() =>
      chat.continueWith(AgentId.parse('posts-manager'), null, later),
    ).toThrow(ChatOfAnotherAgentException);
    expect(chat.updatedAt).toEqual(opened);
  });

  it('is renamed by the person, whatever it was called', () => {
    const chat = started().retitle(ChatTitle.parse('My posts'), later);

    expect(chat.title?.value).toBe('My posts');
    expect(chat.updatedAt).toEqual(later);
  });
});
