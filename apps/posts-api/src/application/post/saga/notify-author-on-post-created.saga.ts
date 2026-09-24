import { Injectable } from '@nestjs/common';
import type { ICommand, IEvent } from '@nestjs/cqrs';
import { AsyncContext, ofType, Saga } from '@nestjs/cqrs';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { NotifyPostCreatedCommand } from '../command/notify-post-created.command';

@Injectable()
export class NotifyAuthorOnPostCreated {
  @Saga()
  notifyTheAuthor = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PostCreatedEvent),
      map((event) => {
        const command = new NotifyPostCreatedCommand.NotifyPostCreated(
          PostId.parse(event.postId),
          PostTitle.parse(event.title),
          UserId.parse(event.authorId),
        );
        AsyncContext.merge(event, command);
        return command;
      }),
    );
}
