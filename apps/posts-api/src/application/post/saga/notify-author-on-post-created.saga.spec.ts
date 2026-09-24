import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { firstValueFrom, of, toArray } from 'rxjs';

import { PostRequest } from '../../shared/post-request';
import { NotifyPostCreatedCommand } from '../command/notify-post-created.command';
import { NotifyAuthorOnPostCreated } from './notify-author-on-post-created.saga';

const postId = PostId.generate();
const authorId = UserId.generate();
const now = new Date('2026-09-23T12:00:00Z');

describe('NotifyAuthorOnPostCreated', () => {
  it('asks to notify the author of a post once it is complete, carrying the request along', async () => {
    const created = new PostCreatedEvent(
      postId.value,
      'Hello',
      'oi',
      authorId.value,
      [],
      2,
      now,
    );
    const request = new PostRequest(postId, 'acme');
    request.attachTo(created);

    const commands = await firstValueFrom(
      new NotifyAuthorOnPostCreated()
        .notifyTheAuthor(of(created))
        .pipe(toArray()),
    );

    expect(commands).toHaveLength(1);
    const [command] = commands as NotifyPostCreatedCommand.NotifyPostCreated[];
    expect(command).toBeInstanceOf(NotifyPostCreatedCommand.NotifyPostCreated);
    expect(command.postId.equals(postId)).toBe(true);
    expect(command.title.value).toBe('Hello');
    expect(command.authorId.equals(authorId)).toBe(true);
    expect(PostRequest.of(command)).toBe(request);
  });

  it('ignores every other event', async () => {
    const updated = new PostUpdatedEvent(
      postId.value,
      'Hello',
      'oi',
      authorId.value,
      'Ana',
      [],
      3,
      now,
      now,
    );

    const commands = await firstValueFrom(
      new NotifyAuthorOnPostCreated()
        .notifyTheAuthor(of(updated))
        .pipe(toArray()),
    );

    expect(commands).toEqual([]);
  });
});
