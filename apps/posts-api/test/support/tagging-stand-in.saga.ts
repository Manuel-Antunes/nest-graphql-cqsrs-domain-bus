import { Injectable, Logger } from '@nestjs/common';
import type { ICommand, IEvent } from '@nestjs/cqrs';
import { ofType, Saga } from '@nestjs/cqrs';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { DEFAULT_TAG_ID } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { isIngested } from '@nestposts/transport-eventbus';
import type { Observable } from 'rxjs';
import { catchError, concatMap, EMPTY, map, of } from 'rxjs';

import { CompletePostCommand } from '../../src/application/post/command/complete-post.command';
import { PostRequest } from '../../src/application/shared/post-request';

@Injectable()
export class TaggingStandIn {
  private readonly logger = new Logger(TaggingStandIn.name);

  @Saga()
  completeTheCreation = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PostPreCreatedEvent),
      concatMap((event) => {
        if (isIngested(event)) {
          return EMPTY;
        }
        const request =
          PostRequest.of(event) ?? new PostRequest(PostId.parse(event.postId));
        return of(
          new CompletePostCommand.CompletePost(
            request.postId,
            TagId.parse(DEFAULT_TAG_ID),
          ),
        ).pipe(
          map((command) => {
            request.attachTo(command);
            return command;
          }),
          catchError((error: Error) => {
            this.logger.error(
              `post ${event.postId} was left without its first tag: ${error.message}`,
            );
            return EMPTY;
          }),
        );
      }),
    );
}
