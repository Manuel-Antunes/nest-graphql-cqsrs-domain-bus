import { AsyncContext } from '@nestjs/cqrs';
import type { PostId } from '../../domain/post/vo/post-id';

/**
 * O contexto de uma request: **o `PostId` que ela toca**, viajando junto de toda a cadeia causal que
 * aquele pedido abre — command → eventos → saga → outros commands.
 *
 * É a peça que o Axon dava de graça. Lá, `@TargetEntityId PostId postId` no command era a chave de
 * roteamento, `@EventTag` marcava os eventos com o mesmo id, e o `ProcessingContext` mantinha os dois
 * lados no mesmo fio: um id gerado na borda (`PostId.newId()`) atravessava o pedido inteiro, e era
 * ele que amarrava os eventos uns aos outros. O @nestjs/cqrs chama isso de
 * [request scoping e request propagation](https://docs.nestjs.com/recipes/cqrs#request-scoping), e a
 * peça é o `AsyncContext`.
 *
 * ## O que o `AsyncContext` é
 * Duas coisas ao mesmo tempo, e as duas importam:
 *
 * 1. **um `ContextId` do Nest** (`this.id`): os buses o registram com
 *    `moduleRef.registerRequestByContextId(...)` antes de resolver o handler, então um handler
 *    `{ scope: Scope.REQUEST }` recebe **este objeto** por `@Inject(REQUEST)`. Um command, um
 *    handler novo — e o mesmo contexto para todos os handlers da mesma cadeia;
 * 2. **um carimbo na mensagem** (`attachTo`): uma propriedade *não-enumerável*, sob um símbolo, no
 *    próprio objeto do command ou do evento.
 *
 * O segundo ponto é o que faz a chave ser metadado, e não payload. O evento continua sendo o que era
 * — primitivos, contrato, o estado resultante e nada mais (ver `DomainEvent`) —, e o `PostId` como
 * value object anda por fora, na mensagem que carrega o fato. É a distinção do Axon entre o payload
 * do evento e a `MetaData` de correlação, com a diferença de que aqui o carimbo é invisível até para
 * um `toEqual`: sendo não-enumerável, ele não muda o que os testes de evento comparam.
 *
 * ## O caminho inteiro
 * ```text
 * PostMutationResolver   commandBus.execute(command, new PostRequest(command.postId))
 *        │                                            └── a chave: o id gerado pelo PostInputMapper
 *        ▼
 * CreatePostCommandHandler  @CommandHandler(Cmd, { scope: Scope.REQUEST }) + @Inject(REQUEST)
 *        │                  publisher.mergeObjectContext(post, this.request)
 *        ▼                       └── o EventBus carimba a request em cada evento publicado
 * PostCreatedEvent ──► AssignDefaultTagOnPostCreated   PostRequest.of(event) → request.postId
 *        │                  ├─► commandBus.execute(new CreateTagCommand(...), request)
 *        │                  └─► request.attachTo(new AssignTagToPostCommand(request.postId, tagId))
 *        ▼
 * TagCreatedEvent, PostUpdatedEvent      ← a mesma request, o mesmo PostId, a mesma cadeia
 * ```
 *
 * O ganho concreto está na saga: ela deixa de reconstruir a identidade do post a partir do primitivo
 * do evento (`PostId.parse(event.postId)`) e passa a **receber** o value object que a borda gerou. O
 * `parse` sobrevive como fallback, para um evento que chegue sem contexto — um replay, um teste que
 * alimenta a saga direto.
 */
export class PostRequest extends AsyncContext {
  constructor(readonly postId: PostId) {
    super();
  }

  /**
   * A request carimbada numa mensagem — o evento que o `EventBus` entregou, o command que a saga
   * recebeu de volta —, ou `undefined` se aquela mensagem não veio de uma.
   *
   * É o `AsyncContext.of` do @nestjs/cqrs estreitado para este tipo: quem chama quer o `postId`, e
   * um contexto anônimo (o que o `CommandBus` cria sozinho quando ninguém passa um) não tem.
   */
  static override of(message: object): PostRequest | undefined {
    const context = AsyncContext.of(message);
    return context instanceof PostRequest ? context : undefined;
  }
}
