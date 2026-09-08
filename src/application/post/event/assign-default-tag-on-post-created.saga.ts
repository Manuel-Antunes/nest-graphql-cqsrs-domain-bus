import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { EMPTY, type Observable, catchError, concatMap, defer, map } from 'rxjs';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { PostId } from '../../../domain/post/vo/post-id';
import { DEFAULT_TAG_NAME } from '../../../domain/tag/tag.entity';
import { TagRepository } from '../../../domain/tag/tag.repository';
import { newTagId, type TagId } from '../../../domain/tag/vo/tag-id';
import { TagName } from '../../../domain/tag/vo/tag-name';
import { CreateTagCommand } from '../../tag/command/create-tag.command';
import { AssignTagToPostCommand } from '../command/assign-tag-to-post.command';

/**
 * Reage a **um** evento de domínio: `PostCreatedEvent`. Garante que todo post nasça com pelo menos uma
 * tag — a saga do @nestjs/cqrs é a peça nativa para "ouvir um evento e despachar commands".
 *
 * ## O que ela faz
 * 1. procura no banco a tag padrão (`Untagged`);
 * 2. se não houver, despacha `CreateTagCommand` — a Tag é um agregado próprio, então nasce como
 *    qualquer agregado nasce: por um command, com o seu próprio evento;
 * 3. devolve ao `EventBus` um `AssignTagToPostCommand`, que faz o Post disparar o `PostUpdatedEvent`
 *    com a tag na lista — e é esse evento que a subscription `onPostUpdated` entrega ao cliente.
 *
 * A saga não escreve no banco nem monta eventos: ela só **despacha commands** e deixa o framework
 * carregar o agregado certo e aplicar as regras dele. O `CreatePostCommandHandler` não sabe que
 * existem tags; o domínio de Tag não sabe que existem posts.
 *
 * ## Consistência eventual, de verdade
 * O Axon esperava o `onAfterCommit` antes de completar o `send`, e por isso a mutation devolvia o post
 * já com a tag. Aqui não há esse gancho: o `EventBus` publica e segue; a saga roda depois, na sua
 * própria unidade de trabalho. A mutation `createPost` devolve o post como nasceu (v1, sem tags), e a
 * tag chega logo em seguida pelo `onPostUpdated` — que é a ordem em que os fatos aconteceram.
 *
 * `concatMap` (e não `mergeMap`) serializa a saga: dois posts criados ao mesmo tempo não disputam a
 * criação da tag padrão. O `catchError` por evento impede que uma falha derrube a saga inteira — sem
 * ele, o `EventBus` completaria o stream e nenhum post futuro ganharia tag.
 */
@Injectable()
export class AssignDefaultTagOnPostCreated {
  private readonly logger = new Logger(AssignDefaultTagOnPostCreated.name);

  constructor(
    private readonly em: EntityManager,
    private readonly tags: TagRepository,
    private readonly commandBus: CommandBus,
  ) {}

  @Saga()
  assignDefaultTag = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(PostCreatedEvent),
      concatMap((event) =>
        defer(() => this.defaultTagId()).pipe(
          map((tagId) => new AssignTagToPostCommand(PostId.parse(event.postId), tagId)),
          catchError((error: Error) => {
            this.logger.error(`post ${event.postId} ficou sem a tag padrão: ${error.message}`);
            return EMPTY;
          }),
        ),
      ),
    );

  /**
   * O id da tag padrão: o que já está no banco, ou o de uma tag recém-criada. O id é gerado aqui para
   * que o command de atribuição já saiba a qual tag se referir, sem uma segunda consulta.
   */
  @CreateRequestContext()
  private async defaultTagId(): Promise<TagId> {
    const existing = await this.tags.findByName(TagName.parse(DEFAULT_TAG_NAME));
    if (existing) {
      return existing.id;
    }
    const tagId = newTagId();
    this.logger.debug(`nenhuma tag ${DEFAULT_TAG_NAME} no banco — criando ${tagId}`);
    return this.commandBus.execute(new CreateTagCommand(tagId, DEFAULT_TAG_NAME));
  }
}
