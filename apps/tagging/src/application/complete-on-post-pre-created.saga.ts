import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { map, type Observable } from 'rxjs';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { AsyncContext } from '@nestjs/cqrs';
import { CompletePostWithDefaultTagCommand } from './complete-post-with-default-tag.command';

@Injectable()
export class CompleteOnPostPreCreated {
  private readonly logger = new Logger(CompleteOnPostPreCreated.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Saga()
  completeOnPostPreCreated = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PostPreCreatedEvent),
      map((event) => {
        this.logger.debug(`post ${event.postId} by ${event.authorId} was born untagged — completing it`);
        const command = new CompletePostWithDefaultTagCommand.CompletePostWithDefaultTag(
          PostId.parse(event.postId),
        );
        AsyncContext.merge(event, command);
        return command;
      }),
    );
}
