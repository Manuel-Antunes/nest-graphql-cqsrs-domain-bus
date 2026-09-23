import type { ICommand, IEvent } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { Injectable, Logger } from '@nestjs/common';
import { AsyncContext, CommandBus, ofType, Saga } from '@nestjs/cqrs';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { map } from 'rxjs';

import { CompletePostWithDefaultTagCommand } from './complete-post-with-default-tag.command';

@Injectable()
export class CompleteOnPostPreCreated {
  private readonly logger = new Logger(CompleteOnPostPreCreated.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Saga()
  completeOnPostPreCreated = (
    events$: Observable<IEvent>,
  ): Observable<ICommand> =>
    events$.pipe(
      ofType(PostPreCreatedEvent),
      map((event) => {
        this.logger.debug(
          `post ${event.postId} by ${event.authorId} was born untagged — completing it`,
        );
        const command =
          new CompletePostWithDefaultTagCommand.CompletePostWithDefaultTag(
            PostId.parse(event.postId),
          );
        AsyncContext.merge(event, command);
        return command;
      }),
    );
}
