import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { catchError, concatMap, defer, EMPTY, map, type Observable } from 'rxjs';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { PostId } from '../../../domain/post/vo/post-id';
import { DEFAULT_TAG_NAME } from '../../../domain/tag/tag.entity';
import { TagRepository } from '../../../domain/tag/tag.repository';
import { TagId } from '../../../domain/tag/vo/tag-id';
import { TagName } from '../../../domain/tag/vo/tag-name';
import { PostRequest } from '../../shared/post-request';
import { CreateTagCommand } from '../../tag/command/create-tag.command';
import { AssignTagToPostCommand } from '../command/assign-tag-to-post.command';

@Injectable()
export class AssignDefaultTagOnPostCreated {
  private readonly logger = new Logger(AssignDefaultTagOnPostCreated.name);

  constructor(
    private readonly tags: TagRepository,
    private readonly commandBus: CommandBus,
  ) {}

  @Saga()
  assignDefaultTag = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PostCreatedEvent),
      concatMap((event) => {
        const request = PostRequest.of(event) ?? new PostRequest(PostId.parse(event.postId));
        return defer(() => this.defaultTagId(request)).pipe(
          map((tagId) => {
            const command = new AssignTagToPostCommand.AssignTagToPost(request.postId, tagId);
            request.attachTo(command);
            return command;
          }),
          catchError((error: Error) => {
            this.logger.error(`post ${event.postId} ficou sem a tag padrão: ${error.message}`);
            return EMPTY;
          }),
        );
      }),
    );

  private async defaultTagId(request: PostRequest): Promise<TagId> {
    const existing = await this.tags.findByName(TagName.parse(DEFAULT_TAG_NAME));
    if (existing) {
      return existing.id;
    }
    const tagId = TagId.generate();
    this.logger.debug(`nenhuma tag ${DEFAULT_TAG_NAME} no banco — criando ${tagId} para o post ${request.postId}`);
    return this.commandBus.execute(new CreateTagCommand.CreateTag(tagId, DEFAULT_TAG_NAME), request);
  }
}
