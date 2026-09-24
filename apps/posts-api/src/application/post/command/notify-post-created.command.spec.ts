import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { POST_CREATED_NOTIFICATION } from '@nestposts/posts/domain/post/notification/post-created.notification';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { USER_NOTIFIABLE_TYPE } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import {
  createCqrsTestingModule,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import {
  givenAnAuthor,
  givenAPost,
} from '../../../../test/support/post-fixtures';
import { PostRequest } from '../../shared/post-request';
import { WebLinks } from '../../shared/web-links';
import { NotifyPostCreatedCommand } from './notify-post-created.command';

describe('NotifyPostCreatedCommand.Handler', () => {
  let module: TestingModule;
  let events: RecordingEvents;

  const execute = (command: NotifyPostCreatedCommand.NotifyPostCreated) =>
    inRequestContext(module, () =>
      module.get(CommandBus).execute(command, new PostRequest(command.postId)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([
      NotifyPostCreatedCommand.Handler,
      {
        provide: WebLinks,
        useValue: new WebLinks('https://web.nestposts.test'),
      },
    ]);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('tells the author, by database and email, that the post is live', async () => {
    const author = await givenAnAuthor(module, 'ana@example.com', 'Ana');
    const post = await givenAPost(module, { author, title: 'Hello, world' });

    await execute(
      new NotifyPostCreatedCommand.NotifyPostCreated(
        post.id,
        post.title,
        author.id,
      ),
    );

    expect(events.ofType(NotificationReceivedEvent)).toEqual([
      expect.objectContaining({
        notificationType: POST_CREATED_NOTIFICATION,
        notifiableType: USER_NOTIFIABLE_TYPE,
        notifiableId: author.id.value,
        data: {
          postId: post.id.value,
          title: 'Hello, world',
          url: `https://web.nestposts.test/posts/${post.id.value}`,
        },
        channels: ['database', 'email'],
        recipient: {
          notifiableName: 'Ana',
          routes: { email: 'ana@example.com' },
        },
      }),
    ]);
  });

  it('names the notification after the post and the author, so telling twice is telling once', async () => {
    const author = await givenAnAuthor(module);
    const post = await givenAPost(module, { author });
    const notify = () =>
      new NotifyPostCreatedCommand.NotifyPostCreated(
        post.id,
        post.title,
        author.id,
      );

    await execute(notify());
    await execute(notify());

    const [first, again] = events.ofType(NotificationReceivedEvent);
    expect(again.notificationId).toBe(first.notificationId);
  });

  it('tells the author from what the event carried, without reading the post', async () => {
    const author = await givenAnAuthor(module);
    const neverStored = PostId.generate();

    await execute(
      new NotifyPostCreatedCommand.NotifyPostCreated(
        neverStored,
        PostTitle.parse('Only in the event'),
        author.id,
      ),
    );

    expect(events.ofType(NotificationReceivedEvent)).toEqual([
      expect.objectContaining({
        data: {
          postId: neverStored.value,
          title: 'Only in the event',
          url: `https://web.nestposts.test/posts/${neverStored.value}`,
        },
      }),
    ]);
  });

  it('tells nobody when the author is gone', async () => {
    const post = await givenAPost(module);

    await execute(
      new NotifyPostCreatedCommand.NotifyPostCreated(
        post.id,
        post.title,
        UserId.generate(),
      ),
    );

    expect(events.ofType(NotificationReceivedEvent)).toEqual([]);
  });
});
