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

/**
 * Reage a **um** evento de domínio: `PostCreatedEvent`. Garante que todo post nasça com pelo menos uma
 * tag — a saga do @nestjs/cqrs é a peça nativa para "ouvir um evento e despachar commands".
 *
 * ## O que ela faz
 * 1. recupera a request que criou o post — o contexto que veio carimbado no evento;
 * 2. procura no banco a tag padrão (`Untagged`);
 * 3. se não houver, despacha `CreateTagCommand` **naquela request** — a Tag é um agregado próprio,
 *    então nasce como qualquer agregado nasce: por um command, com o seu próprio evento;
 * 4. devolve ao `EventBus` um `AssignTagToPostCommand`, também carimbado, que faz o Post disparar o
 *    `PostUpdatedEvent` com a tag na lista — e é esse evento que a subscription `onPostUpdated`
 *    entrega ao cliente.
 *
 * A saga não escreve no banco nem monta eventos: ela só **despacha commands** e deixa o framework
 * carregar o agregado certo e aplicar as regras dele. O `CreatePostCommandHandler` não sabe que
 * existem tags; o domínio de Tag não sabe que existem posts.
 *
 * ## A request atravessa o `EventBus`
 * É aqui que o [request propagation](https://docs.nestjs.com/recipes/cqrs#request-scoping) do
 * @nestjs/cqrs paga: `PostRequest.of(event)` devolve **o mesmo objeto** que o `PostMutationResolver`
 * criou lá atrás, com o `PostId` que ele gerou. A saga, então, não reconstrói a identidade do post a
 * partir do primitivo do evento — ela a recebe pronta, como value object, e a repassa aos dois
 * commands que despacha. É o `@TargetEntityId PostId postId` da versão Axon, em que a chave gerada na
 * borda roteava o command e marcava os eventos: uma chave, uma cadeia, e todos os eventos dela
 * correlacionados — `PostCreated` → `PostUpdated`, com um `TagCreated` no meio quando a tag padrão
 * ainda não existe.
 *
 * Duas formas de propagar, as duas do manual, e as duas aparecem abaixo: `attachTo(command)` carimba
 * o command que a saga **devolve** (quem o executa é o `EventBus`, e não há onde passar o contexto);
 * o segundo argumento do `commandBus.execute` serve ao command que a saga despacha **ela mesma**.
 *
 * O `PostId.parse(event.postId)` sobrevive como fallback, para um evento que chegue sem request —
 * um replay do event store, um teste que alimenta a saga direto com um `of(evento)`.
 *
 * ## Consistência eventual, de verdade
 * O Axon esperava o `onAfterCommit` antes de completar o `send`, e por isso a mutation devolvia o post
 * já com a tag. Aqui não há esse gancho: o `EventBus` publica e segue; a saga roda depois, na sua
 * própria unidade de trabalho — mesma *request*, outro fork do EntityManager. A mutation `createPost`
 * devolve o post como nasceu (v1, sem tags), e a tag chega logo em seguida pelo `onPostUpdated` — que
 * é a ordem em que os fatos aconteceram.
 *
 * `concatMap` (e não `mergeMap`) serializa a saga: dois posts criados ao mesmo tempo não disputam a
 * criação da tag padrão. O `catchError` por evento impede que uma falha derrube a saga inteira — sem
 * ele, o `EventBus` completaria o stream e nenhum post futuro ganharia tag.
 */
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

  /**
   * O id da tag padrão: o que já está no banco, ou o de uma tag recém-criada. O id é gerado aqui para
   * que o command de atribuição já saiba a qual tag se referir, sem uma segunda consulta.
   *
   * @param request A request do post que disparou a saga — repassada ao `CreateTagCommand` para que
   * o `TagCreatedEvent` nasça na mesma cadeia.
   */
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
