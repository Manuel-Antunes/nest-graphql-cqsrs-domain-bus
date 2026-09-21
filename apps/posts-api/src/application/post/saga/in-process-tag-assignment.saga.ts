import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { catchError, concatMap, EMPTY, map, type Observable, of } from 'rxjs';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { DEFAULT_TAG_ID } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { isIngested } from '@nestposts/transport-eventbus';
import { PostRequest } from '../../shared/post-request';
import { CompletePostCommand } from '../command/complete-post.command';

@Injectable()
export class InProcessTagAssignment {
  private readonly logger = new Logger(InProcessTagAssignment.name);

  constructor(private readonly commandBus: CommandBus) {}

  @Saga()
  completeTheCreation = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PostPreCreatedEvent),
      concatMap((event) => {
        if (isIngested(event)) {
          return EMPTY;
        }
        const request = PostRequest.of(event) ?? new PostRequest(PostId.parse(event.postId));
        return of(new CompletePostCommand.CompletePost(request.postId, TagId.parse(DEFAULT_TAG_ID))).pipe(
          map((command) => {
            request.attachTo(command);
            return command;
          }),
          catchError((error: Error) => {
            this.logger.error(`post ${event.postId} was left without its first tag: ${error.message}`);
            return EMPTY;
          }),
        );
      }),
    );
}
