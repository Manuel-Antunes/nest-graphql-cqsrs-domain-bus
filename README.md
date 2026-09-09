# nest-graphql-posts

POC: **NestJS 12** + **@nestjs/cqrs 12** + **MikroORM 7** + **@nestjs/graphql 14 (Apollo)** com subscriptions GraphQL alimentadas **pelo próprio `EventBus` do CQRS**, numa API DDD de posts e tags. É a reescrita em TypeScript do [axon-graphql-posts](https://github.com/Manuel-Antunes/axon-graphql-posts) (Axon Framework 5 + Reactor + Spring GraphQL), com a mesma estrutura e o mesmo schema.

A ideia central: o `EventBus` do @nestjs/cqrs **é um `Observable`** do RxJS (um `Subject` por baixo) — o mesmo objeto em que os event handlers e as sagas se inscrevem. Uma subscription GraphQL é, no fundo, "devolva um async iterator". Então basta ligar um ao outro.

Em cima disso, o projeto acrescenta a peça que o @nestjs/cqrs não tem: **CQSRS — Command, Query, *Subscription* Responsibility Segregation** (`src/cqsrs`). Um bus próprio para a terceira mensagem, com `subscribe` no lugar de `execute`:

| | mensagem | decorator | handler | bus | resultado |
|---|---|---|---|---|---|
| command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
| query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
| **subscription** | **`Subscription<TEvent, TCriteria>`** | **`@SubscriptionHandler`** | **`subscribe`** | **`SubscriptionBus`** | **`Observable<TEvent>`** |

E o filtro é da mensagem, não do transporte: toda `Subscription` tem um método `filter(event)`, e o critério que ele lê (`{ postId }`) **é também a chave** pela qual o bus acha o stream — dois assinantes de `onPostUpdated(postId: X)` recebem o mesmo `Observable` e custam **uma** inscrição no `EventBus`.

E a request é uma só, do começo ao fim da cadeia. Os command handlers são `{ scope: Scope.REQUEST }`, a borda cria uma `PostRequest` cuja chave é o próprio `PostId`, e o [request scoping/propagation](https://docs.nestjs.com/recipes/cqrs#request-scoping) do @nestjs/cqrs a leva do command para os eventos, dos eventos para a saga, e da saga para os commands que ela despacha — inclusive os de outro agregado. É o `@TargetEntityId PostId postId` + `@EventTag` da versão Axon, em que um id gerado na borda roteava o command e marcava os eventos, dito com a ferramenta do Nest: um `createPost` produz `PostCreated` → `PostUpdated` (com um `TagCreated` no meio, quando a tag padrão ainda não existe) **carimbados com o mesmo objeto**.

Estado em **SQLite** via MikroORM; event store em memória (o próprio `EventBus`).

```
mutation createPost(input) ──► PostInputMapper.toCreateCommand(input)     [protocolo → command; gera o PostId]
                              │
                              └─► commandBus.execute(command, new PostRequest(command.postId))
                                       │                          [a request nasce na borda; sua chave é o PostId]
                                       ▼
                  CreatePostCommand.Handler  @CreateRequestContext()     [aplicação — mensagem + handler num
                     │                      { scope: Scope.REQUEST }      arquivo só (namespace), um fork do
                     │                      @Inject(REQUEST)              EntityManager por command, resolvido
                     │                                                    no ContextId da PostRequest]
                     ├─► Post.create(...)   [domínio — valida (Zod), apply(PostCreatedEvent) → onPostCreatedEvent]
                     ├─► PostRepository.save(post)                       [persist + flush = uma transação]
                     └─► post.commit()      [publica os eventos não-commitados no EventBus — DEPOIS de salvar, e
                                             carimbados: mergeObjectContext(post, this.request)]
                              │
                              ▼
                  EventBus (Subject do RxJS) ── ofType(PostCreatedEvent) ──┬─► OnPostCreatedSubscription.Handler.subscribe()
                     │                                                    │      └─► PostView do payload ──► onPostCreated
                     │                                                    └─► AssignDefaultTagOnPostCreated (@Saga)
                     │                                                           │   PostRequest.of(event) ──► o PostId como VO
                     │                                                           ├─► tag "Untagged" no banco? não ──► CommandBus.execute(CreateTagCommand.CreateTag, request)
                     │                                                           └─► emite AssignTagToPostCommand.AssignTagToPost, carimbado ──► EventBus o executa
                     │                                                                    └─► Post.assignTag(...) ──► PostUpdatedEvent (com a tag)
                     └── ofType(PostUpdatedEvent) ──► OnPostUpdatedSubscription.Handler.subscribe()
                                                                    │
                                                                    ▼
                  SubscriptionBus: filter(event) da própria mensagem + share por chave (id + critério)
                                   um stream por critério; desliga quando o último assinante sai
                                                                    │
                                                                    ▼
                  PostSubscriptionResolver: subscribeAsAsyncIterable(bus, new OnPostUpdatedSubscription.OnPostUpdated({ postId }),
                                                                     evento => PostView)  ──► @Subscription({ resolve })
                                                                    │
                                                                    ▼
                  Apollo ──► graphql-ws (WebSocket em /graphql) ──► { "data": { "onPostUpdated": { ... } } }
```

## Stack

| Peça | Versão |
|---|---|
| Node | 22 (`require(esm)` nativo — o MikroORM 7 é ESM-only) |
| TypeScript | 6 (o 7 ainda não expõe a API programática que o Nest CLI usa) |
| NestJS (`@nestjs/core`, `platform-express`) | 12.x |
| `@nestjs/cqrs` | 12.x — `Command<T>`/`Query<T>` tipados, `WithAggregateRoot`, `@Saga`, `ofType` |
| `@nestjs/graphql` + `@nestjs/apollo` + `@apollo/server` | 14.x / 5.x — code-first, subscriptions por `graphql-ws` |
| MikroORM (`core`, `sqlite`, `nestjs`, `decorators`) | 7.x — `defineEntity`, `findByCursor`, `@CreateRequestContext` |
| Zod | 4.x — os value objects |
| Vitest + `unplugin-swc` | testes (a receita do Nest para SWC; o Jest não faz `require()` de ESM no Node 22) |

## Camadas

As mesmas três regras da versão Java, e os mesmos três diretórios de raiz agrupados por papel:

1. **Uma classe por handler.** Cada command, query e subscription tem a sua classe de handler, ao lado da mensagem que ela trata.
4. **O filtro é da mensagem.** Quem pede uma subscription monta o *critério*; quem escreve a subscription decide o que ele *quer dizer*. O `filter` mora na classe da mensagem, na camada de aplicação — a interface nunca peneira stream.
2. **O domínio dispara, a aplicação ouve.** Os eventos vivem em `domain/*/event`; quem os dispara são as entidades, por `apply(...)`. Quem os ouve mora em `application/post/event` (a saga) e `application/post/subscription` (as subscriptions).
3. **O command decide e salva; o evento notifica e orquestra.** O handler chama o domínio, grava a entidade e só então faz `commit()`. A saga não grava nada: despacha commands.

```
src
├── app.module.ts, main.ts                       # um módulo só; as camadas são os diretórios
├── dto/graphql                                  # a forma do dado NO PROTOCOLO (@ObjectType / @InputType)
│   ├── create-post.input, update-post.input     #   entrada: espelham os input do schema
│   ├── post.view, tag.view                      #   saída: achatam os value objects para o schema
│   └── connection, post.connection              #   PageInfo + Connection(classRef) → PostConnection, TagConnection
├── mapper                                       # TODO mapeamento do projeto
│   ├── post-input.mapper                        #   input GraphQL → command   (protocolo → aplicação)
│   └── post-view.mapper                         #   Post | evento → PostView  (domínio → protocolo)
├── exceptions
│   └── domain-exception.filter                  #   exceções do domínio → GraphQLError com extensions.code
│
├── domain                                       # regras, invariantes E o mapeamento do próprio estado
│   ├── shared/domain-event, aggregate-entity    #   marcador dos fatos + AggregateEntity = WithAggregateRoot(BaseEntity)
│   ├── post
│   │   ├── post.entity                          #   Post (classe) + PostSchema (defineEntity), numa classe só
│   │   │                                        #     decidir: create()/update()/assignTag() → apply(evento)
│   │   │                                        #     evoluir: onPostCreatedEvent()/onPostUpdatedEvent(), idempotentes
│   │   ├── post.repository                      #   porta (classe abstrata = token de injeção)
│   │   ├── vo/post-id, post-title, post-content, author   # schemas Zod branded
│   │   │                                        #     tags: Collection<Tag> — relação m:n (pivô posts_tags)
│   │   ├── event/post-created.event, post-updated.event   # payload primitivo; estado resultante completo
│   │   └── exception/invalid-post, post-not-found, post-already-exists
│   └── tag
│       ├── tag.entity, tag.repository, vo/tag-id, tag-name
│       ├── event/tag-created.event
│       └── exception/invalid-tag, tag-not-found, tag-already-exists
├── application                                  # orquestra: carrega, decide pelo domínio, salva, publica
│   ├── post
│   │   ├── command/create-post, update-post, assign-tag-to-post   # um .command.ts por fatia: dentro do
│   │   │                                                          #   namespace, a mensagem E o Handler dela
│   │   ├── event/assign-default-tag-on-post-created.saga           # OUVE PostCreated, despacha commands
│   │   ├── query/find-post, find-all-posts                        # idem, num .query.ts por fatia
│   │   └── subscription/on-post-created, on-post-updated          # idem: Subscription<evento, critério> com o
│   │                                                              #   filter + o @SubscriptionHandler, num .subscription.ts
│   ├── shared/post-request                                        # PostRequest extends AsyncContext: a chave (o PostId)
│   │                                                              #   que atravessa command → eventos → saga → commands
│   └── tag/command/create-tag                                     # idem
├── infrastructure/persistence/sqlite            # escolhas de deploy; nenhuma regra de negócio
│   ├── mikro-orm.config                         #   SQLite, ensureDatabase, POSTS_DB
│   └── mikro-orm-post.repository, mikro-orm-tag.repository       # adapters das portas (findByCursor aqui)
├── interfaces/graphql
│   ├── post-query.resolver, post-mutation.resolver, post-subscription.resolver
│   └── post-tags.resolver                       #   campo Post.tags: cursor connection recortada em memória
│
└── cqsrs                                        # CQSRS: a terceira mensagem. Não sabe o que é GraphQL
    ├── cqsrs.module                             #   CqrsModule + SubscriptionBus, reexportando tudo
    │                                            #   forRoot e forRootAsync (as 4 formas do Nest)
    ├── subscription-bus                         #   subscribe(): acha o handler, aplica o filter, compartilha por chave
    ├── classes/subscription                     #   Subscription<TEvent, TCriteria>: criteria (dado) + filter (regra) + key
    ├── decorators/subscription-handler          #   @SubscriptionHandler(Sub) — as duas metadatas
    ├── interfaces                               #   ISubscription, ISubscriptionHandler (subscribe → Observable), ISubscriptionBus…
    ├── services/subscription-explorer           #   varre os providers no bootstrap, como o ExplorerService do cqrs
    ├── exceptions                               #   handler não encontrado / handler inválido
    └── helpers                                  #   subscription-key (o critério → chave estável)
                                                 #   observable-to-async-iterable (Observable → AsyncIterableIterator)
                                                 #   subscribe-as-async-iterable (o que um resolver chama)
```

Schema gerado (code-first) em `schema.gql` na subida.

## Do Axon 5 pro @nestjs/cqrs (e por que está assim)

| Axon 5 (versão Java) | @nestjs/cqrs 12 (este projeto) |
|---|---|
| `@EventSourced` + `@EntityCreator` + `@EventSourcingHandler` | `WithAggregateRoot(BaseEntity)`: `apply(evento)` chama `on<Evento>(evento)`; `loadFromHistory` é o replay |
| `events.raise(evento)` pela porta `DomainEventPublisher` + `EventAppender` | `this.apply(evento)` guarda em `getUncommittedEvents()`; `EventPublisher.mergeObjectContext(post)` liga `commit()` ao `EventBus` |
| `@CommandHandler` em classe própria, `@InjectEntity Post` | `@CommandHandler(Cmd)` num `namespace` junto da mensagem (`CreatePostCommand.Handler`); o handler carrega pelo repositório |
| `ProcessingContext` por command (evento + linha commitam juntos) | `@CreateRequestContext()` do MikroORM: um fork do EntityManager por command; `flush` é a transação; `commit()` vem depois |
| `@TargetEntityId PostId postId` no command + `@EventTag` nos eventos: uma chave gerada na borda roteia e correlaciona | `PostRequest extends AsyncContext` com o `PostId` como chave; `commandBus.execute(command, request)` na borda e `mergeObjectContext(post, request)` no handler |
| `ProcessingContext` propagado do command para os eventos e para o que reage a eles | request scoping do @nestjs/cqrs: `@CommandHandler(Cmd, { scope: Scope.REQUEST })` + `@Inject(REQUEST)`; a saga repassa com `PostRequest.of(event)` e `request.attachTo(command)` |
| `@EventHandler` + `ProcessingContext.onAfterCommit(...)` despachando commands | `@Saga()`: `Observable<evento> → Observable<command>`, o `EventBus` executa o que sai |
| `subscriptionQuery` + `QueryUpdateEmitter.emit(...)` | `Subscription<Evento, Critério>` + `@SubscriptionHandler`; `subscriptionBus.subscribe(sub)` devolve `eventBus.pipe(ofType(Evento))` filtrado |
| `Flux` no `@SubscriptionMapping` + SSE | `subscribeAsAsyncIterable(bus, sub, projeção)` no `@Subscription` + graphql-ws |
| filtro por tópico avaliado no `emit` (`sub -> sub.matches(id)`) | `filter(event)` na própria `Subscription`, aplicado pelo bus dentro do stream — e o critério é a chave que compartilha o stream |
| `ScrollSubrange` / `Window` do Spring Data | `em.findByCursor` do MikroORM: itens + `hasNextPage` + cursores prontos |
| `@Embeddable record` com validação no construtor | schema Zod `.brand<'PostTitle'>()`: só o `parse` produz o tipo |
| `@ElementCollection(LAZY)` + DataLoader | `p.manyToMany(TagSchema).owner()` — `Collection<Tag>` com pivô `posts_tags`; `populate` no repositório e `dataloader: DataloaderType.ALL` no config |
| MapStruct | `PostInputMapper` / `PostViewMapper` injetáveis, à mão |
| Bean Validation na borda + VO no domínio | uma altura só: o domínio (Zod); o `DomainExceptionFilter` traduz para `BAD_USER_INPUT` |
| `AppGraphQlExceptionHandler` | `APP_FILTER` com um `ExceptionFilter` que **devolve** um `GraphQLError` |

## Rodando

```bash
pnpm install
pnpm start:dev          # http://localhost:3000/graphql — GraphiQL no browser, subscriptions por graphql-ws
```

## Testando na mão

Terminal 1 — abre a subscription global (com [`graphql-ws` CLI](https://the-guild.dev/graphql/ws) ou qualquer cliente; ou pelo GraphiQL):

```graphql
subscription { onPostCreated { id title author version } }
```

Terminal 2 — dispara o command:

```bash
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation { createPost(input:{title:\"Nest + GraphQL\", content:\"oi\", author:\"manuel\"}) { id title version tags(first: 5) { edges { node { id name } } } } }"}'
```

O terminal 1 recebe `{"data":{"onPostCreated":{"id":"…","title":"Nest + GraphQL","author":"manuel","version":1}}}`.

A mutation responde o post **como ele nasceu** — `version: 1`, sem tags — e logo em seguida `onPostUpdated` entrega a `version: 2` com a tag `Untagged`. É a diferença de consistência entre os dois frameworks, explicada abaixo.

Subscription filtrada por tópico e o resto:

```graphql
subscription { onPostUpdated(postId: "<ID>") { id title content version } }
```

```bash
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation { updatePost(input:{id: \"<ID>\", title: \"editado\"}) { id title version } }"}'

curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ post(id: \"<ID>\") { id title content updatedAt version tags(first: 5) { edges { cursor node { name } } } } }"}'

# cursor connection: primeira página, depois `after` = endCursor da anterior
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ posts(first: 1) { edges { cursor node { id title } } pageInfo { hasNextPage endCursor } totalCount } }"}'
```

Smoke test automatizado (builda, sobe com banco novo, abre 3 subscriptions por graphql-ws, dispara mutations, confere contagens, derruba — logs em `.poc-logs/`):

```bash
pnpm smoke
```

## Testes

```bash
pnpm test        # unitários e de handler (src/**/*.spec.ts)
pnpm test:e2e    # a aplicação inteira, por HTTP + WebSocket (test/*.e2e-spec.ts)
pnpm test:all
```

- `post.entity.spec` / `tag.entity.spec` — domínio puro: sem `EventPublisher`, sem `EventBus`, sem banco. O único colaborador é o próprio aggregate root: `getUncommittedEvents()` diz exatamente o que foi disparado. O `post.entity.spec` inicializa um MikroORM **só para descoberta** (sem `ensureDatabase`, nenhuma tabela criada): desde que `Post.tags` virou relação, uma `Collection` precisa da metadata do dono para saber a que propriedade pertence. Os testes `the state returned by update is the same as sourcing the raised events` (via `loadFromHistory`) e `applying the same event twice leaves the same state` travam o contrato decidir/evoluir.
- `create-post.command.spec`, `update-post.command.spec`, `assign-tag-to-post.command.spec`, `create-tag.command.spec` — um por fatia, ao lado do arquivo que ela ocupa, com `@nestjs/testing`. O fixture (`test/support/cqrs-testing-module.ts`) monta o `CqsrsModule` de verdade, o MikroORM de verdade num SQLite em memória, os repositórios — e **só o handler do teste**, então uma dependência acidental entre dois deles quebra o teste. Não há repositório fake: como salvar é responsabilidade do command, o banco é quem prova que ele salvou, e um `RecordingEvents` pendurado no `EventBus` prova o que ele publicou. Como os handlers são `{ scope: Scope.REQUEST }`, o teste despacha pelo `CommandBus` com uma `PostRequest`: não existe "a" instância de um handler request-scoped para pegar do módulo — e esse é justamente o caminho de produção.
- `find-all-posts.query.spec` — a mecânica da cursor connection de `posts`: a linha a mais que decide o `hasNextPage` nunca vaza, o `endCursor` de uma página é o `after` da seguinte.
- `assign-default-tag-on-post-created.saga.spec` — a saga é uma função `Observable → Observable`: alimenta-se um `of(evento)` e colhem-se os commands. Cria a tag quando não existe, reusa quando existe, serializa dois posts criados ao mesmo tempo, **sobrevive a uma falha** (sem o `catchError` por evento, o `EventBus` completaria o stream e nenhum post futuro ganharia tag), tira o `PostId` da request que veio carimbada no evento em vez do primitivo do payload, carimba o command que devolve com a mesma request — e cai no `PostId.parse` quando o evento chega sem request nenhuma.
- `post-request.spec` — a propagação de ponta a ponta, com os quatro command handlers e a saga no mesmo módulo: um `createPost` abre uma cadeia de três eventos por três handlers request-scoped diferentes, dois deles despachados pela saga, e os três saem carimbados com **o mesmo objeto**. Confere também que a chave viaja como *metadado*: o `PostId` chega à saga como value object, o payload do evento continua primitivo, e o carimbo (não-enumerável, sob um símbolo) não aparece no `toEqual` de um evento.
- `post-tags.resolver.spec` — o recorte em memória de `Post.tags`, que é a parte da connection que é lógica nossa.
- `subscription-bus.spec` — o `SubscriptionBus` num módulo Nest de verdade (`CqsrsModule.forRoot()`, explorer e tudo): roteia a mensagem para o seu `@SubscriptionHandler`, aplica o `filter` da mensagem dentro do stream, entrega **o mesmo `Observable`** para o mesmo critério (dois assinantes, uma inscrição no `EventBus`, o handler chamado uma vez só), separa critérios diferentes, desliga a fonte quando o último assinante sai e a religa sob demanda, e explode com `SubscriptionHandlerNotFoundException` quando ninguém trata a mensagem.
- `cqsrs.module.spec` — o módulo: `forRootAsync` nas quatro formas (`useValue`, `useFactory` com `inject`, `useClass`, `useExisting`), as opções chegando **nos dois lados** (o `subscriptionPublisher` no `SubscriptionBus`, o `eventPublisher` no `EventBus` — prova de que o resto é repassado ao `CqrsModule`), a factory de quem chama rodando **uma vez só**, e o `@SubscriptionHandler` registrado no bootstrap também pelo caminho assíncrono.
- `subscription-key.spec` — a chave: mesma coisa em qualquer ordem dá a mesma chave, `undefined` é o mesmo que ausente, `null` não é, arrays mantêm a ordem.
- `on-post-updated.subscription.spec` — o filtro por tópico como o que ele é: regra de aplicação, testada sem subir bus nenhum.
- `observable-to-async-iterable.spec` — o helper: entrega em ordem, `return()` cancela a inscrição **mesmo com um `next()` pendente**, erro propaga.
- `domain-exception.filter.spec` — a tabela exceção → `extensions.code`.
- `posts.e2e-spec` — o smoke test como teste: sobe o `AppModule` com SQLite em memória (`POSTS_DB` no `vitest.e2e.config.mts`), fala HTTP para queries/mutations e graphql-ws para subscriptions. Confere a ordem command → evento → entrega, a chegada da tag padrão por `onPostUpdated`, o filtro por tópico (o assinante filtrado vê só o seu post; o global vê tudo), os erros com código, as duas connections — que desassinar tira o assinante do `EventBus` na hora, contando os `observers` do `Subject`, e que **dois assinantes do mesmo tópico compartilham um stream só**: o `EventBus` não passa de um assinante, os dois recebem o mesmo payload, e a fonte só cai quando o segundo sai. E, pendurado no `EventBus`, que a `PostRequest` criada no resolver sobrevive ao caminho de verdade (Express → Apollo → `CommandBus` → saga): todos os eventos daquela mutation carregam o mesmo objeto.

## Decisões que valem comentar

**O `EventBus` é o emitter.** Não há `PubSub` do `graphql-subscriptions`, não há `Subject` novo, não há `@EventsHandler` que "emite" para as subscriptions. `ObservableBus` estende `Observable`, e `ofType` é o operador que o próprio @nestjs/cqrs exporta para as sagas. Uma subscription GraphQL ouve o mesmo stream que a saga da tag padrão. Cada *stream* do `SubscriptionBus` é exatamente um `subscribe` no `Subject` — o e2e prova isso contando `eventBus.subject$.observers`.

**Subscription é uma mensagem própria, não uma query.** A primeira versão modelava subscription como query: `OnPostUpdatedSubscription extends Query<Observable<PostUpdatedEvent>>`, e o `QueryBus.execute` devolvia o `Observable` inteiro porque um `Observable` não é *thenable* — `await` de um não-thenable devolve ele mesmo. Funcionava, mas por acidente: o contrato dizia "uma resposta e acabou" (`Promise<T>`) enquanto o valor era "um stream que fica aberto". E `execute` não é o verbo de quem se inscreve.

Daí o `src/cqsrs`: `Subscription<TEvent, TCriteria>`, `@SubscriptionHandler`, `ISubscriptionHandler` com `subscribe(): Observable<TEvent>` e um `SubscriptionBus` com a mesma anatomia do `QueryBus` (um `Map` de handlers por id de mensagem, um publisher, um explorer que varre os providers no bootstrap) mais o que só um stream precisa: um `Map` do que está no ar. Decidir quais eventos alimentam qual subscription continua sendo regra da aplicação; a interface só converte o stream para o transporte.

**Uma factory, não duas.** `CqsrsModule.forRootAsync` tem um problema que o `forRoot` não tem: as opções servem a dois módulos — o `CqsrsModule` (que só quer o `subscriptionPublisher`) e o `CqrsModule` embaixo (que quer todo o resto). O caminho ingênuo é passar as `CqsrsModuleAsyncOptions` para os dois, e aí a `useFactory` de quem chamou roda **duas vezes** — o que é no mínimo surpreendente, e no pior caso abre duas conexões. A saída é resolver as opções num módulo só (`CqsrsOptionsModule`, que as exporta pelo token `CQSRS_MODULE_OPTIONS`) e dar ao `CqrsModule.forRootAsync` uma factory que apenas repassa o que já foi resolvido. O mesmo objeto de módulo dinâmico entra nas duas listas de `imports`: o Nest identifica um módulo dinâmico pelo par (classe, metadata), então as duas referências são o mesmo módulo, com uma instância só. O `cqsrs.module.spec` trava isso contando as chamadas.

**O `SubscriptionBus` não é um `ObservableBus`.** Os três buses do @nestjs/cqrs *são* `Observable`s das mensagens que passam por eles. Este não pode ser: `ObservableBus` estende `Observable`, e `Observable` já tem um `subscribe` — que quer dizer outra coisa. Duas coisas diferentes não cabem no mesmo nome, e `subscribe(subscription)` é o método que dá sentido ao bus. O `Subject` continua lá, exposto como `subscriptions$` — mesmo stream, nome que não mente.

**A cola entre push e pull, e por que ela existe.** `observableToAsyncIterable` é o que separa o CQSRS do transporte: o bus fala RxJS, o graphql-js quer um async iterator. A primeira versão era um `ReadableStream` do Node (async-iterável por natureza, dez linhas) — e vazava assinantes: `ReadableStream`, `stream.Readable` e `async function*` **serializam `return()` atrás de um `next()` pendente**. Uma subscription GraphQL passa a vida esperando o próximo evento; quando o cliente desconecta, o graphql-js chama `return()`, que só resolveria no próximo evento. Até lá o assinante continuava vivo no `EventBus`. Um iterador com fila explícita resolve os `next()` pendentes com `done: true` na hora — é a mesma mecânica do `PubSubAsyncIterableIterator` do `graphql-subscriptions`, ligada a um `Observable` em vez de a um PubSub.

**O filtro é da mensagem, e o filtro é a chave.** `onPostUpdated(postId)` era o `filter` do `@Subscription` do @nestjs/graphql: o `Observable` era o mesmo para todos e o transporte peneirava por assinante. Agora o filtro é um método da própria mensagem, na camada de aplicação:

```ts
export class OnPostUpdatedSubscription extends Subscription<PostUpdatedEvent, { postId?: string | null }> {
  override filter(event: PostUpdatedEvent): boolean {
    return !this.criteria.postId || event.postId === this.criteria.postId;
  }
}
```

Uma subscription tem duas metades, e as duas são regra de aplicação: o **critério** (o dado — quais eventos interessam), que quem pede monta com os argumentos do protocolo, e o **filtro** (a regra — o que aquele critério quer dizer), que a aplicação escreve ao lado da mensagem. A interface diz *o quê*, a aplicação decide *como*, e o bus aplica sem saber nada do domínio: ele só chama `subscription.filter(event)`.

O ganho de ter isso na mensagem é o `key`: o critério serializado de forma estável **é** a identidade do pedido. Dois assinantes de `onPostUpdated(postId: X)` pedem literalmente a mesma coisa, então recebem o mesmo `Observable` — o filtro roda uma vez para os dois e o `EventBus` enxerga um assinante só. É a diferença entre O(assinantes) e O(critérios distintos) de trabalho por evento. O `share({ resetOnRefCountZero: true })` fecha o ciclo: quando o último assinante de um critério sai, a inscrição na fonte cai junto, e o mapa do que está no ar se limpa sozinho (`finalize` tira a entrada, `defer` a repõe se alguém reassinar).

`resolve: (payload) => payload` continua lá: diz ao graphql-js que o payload **é** o valor, em vez de procurar `payload.onPostUpdated`. E o resolver devolve um `AsyncIterableIterator` (iterator que também é iterable) porque um wrapper como o `withFilter` chama `next()`/`return()` direto no que o resolver devolveu, enquanto o graphql-js pede o `[Symbol.asyncIterator]()`.

**Por que Apollo, e não Mercurius.** A POC começou com Mercurius (Fastify), e tudo funcionava — inclusive o filtro, que na época era o do `@Subscription`. A diferença apareceu no desassinar: o `withFilter` do Mercurius é um `async function*` com `yield*`, e um async generator só processa `return()` depois que o `next()` pendente resolve. Um assinante filtrado que desconectava ficava pendurado no `EventBus` até o próximo `PostUpdatedEvent`. O `withFilter` do caminho Apollo é um iterador explícito; a inscrição cai na hora. Para uma POC sobre subscriptions, a limpeza imediata pesou mais que o Fastify.

**Uma classe por entidade, e o mixin no lugar certo.** `Post` é a entidade de domínio, o aggregate root do @nestjs/cqrs e o mapeamento do MikroORM (`PostSchema = defineEntity({ class: Post, ... })`), numa classe só. A base é `AggregateEntity = WithAggregateRoot(BaseEntity)`: a entidade já precisa herdar do `BaseEntity` do ORM, então `extends AggregateRoot` não serve — é exatamente o cenário para o qual o mixin existe. Uma constante compartilhada, e não um `WithAggregateRoot(...)` por entidade, porque o MikroORM descobre a classe-pai de cada entidade como entidade abstrata, e duas classes anônimas de nome `AggregateRoot` seriam ambíguas para ele. (Tentei antes `class Post extends WithAggregateRoot(PostSchema.class)` com `setClass`: a classe intermediária do mixin entra na cadeia de protótipos e a descoberta do ORM entra em loop — `Post extends AggregateRoot extends Post`.)

**`forceConstructor: true`.** O MikroORM hidrata entidades por `Object.create(prototype)`, sem chamar o construtor — e é no construtor que o mixin inicializa a lista de eventos não-commitados. Sem isso, um `post.apply(...)` numa entidade carregada do banco explode. Com `forceConstructor` no schema, um Post que volta do banco nasce pelo `new` e chega inteiro; o `create-post.command.spec` confere que ele volta com `getUncommittedEvents()` vazio.

**Um fork do EntityManager por command.** `@CreateRequestContext()` em todo command handler. Sem ele, um command despachado pela saga herda (pelo `AsyncLocalStorage`) o contexto da request HTTP que publicou o evento, e dois fluxos concorrentes dividem o mesmo identity map — o post que a mutation lê de volta e o que a saga está mutando seriam o mesmo objeto. É **metade** do `ProcessingContext` por command do Axon — a transacional —, dita com a ferramenta do ORM; a outra metade, a identidade do pedido, é o bloco acima. As queries usam `@EnsureRequestContext()`: rodam no contexto da request quando há um, e criam o seu quando não há (teste, WebSocket). O preço é o handler receber `EntityManager` no construtor só para o decorator achar `this.em`.

**Uma fatia, um arquivo — a mensagem e o handler dentro de um `namespace`.** Command, query e subscription moram no mesmo arquivo do handler que os trata, sob um `namespace` de mesmo nome do arquivo:

```ts
// application/post/command/assign-tag-to-post.command.ts — não existe mais um .handler.ts ao lado
export namespace AssignTagToPostCommand {
  export class AssignTagToPost extends Command<void> {
    constructor(readonly postId: PostId, readonly tagId: TagId) { super(); }
  }

  @CommandHandler(AssignTagToPost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<AssignTagToPost> { /* ... */ }
}

// quem despacha                                    // quem registra (app.module)
new AssignTagToPostCommand.AssignTagToPost(id, tag) // AssignTagToPostCommand.Handler
```

O par mensagem/handler é o que menos se separa nesta arquitetura — mudar o que um command carrega é mudar quem o trata, sempre —, e dois arquivos por caso de uso só faziam o leitor saltar entre eles. É o mesmo agrupamento dos `Command`/`Handler` aninhados do MediatR, com a ferramenta que o TypeScript tem para isso. O namespace ainda deixa o handler ter um nome curto sem perder contexto: `Handler` diz tudo quando o namespace já disse de quem, e o `applicationProviders` vira um índice dos casos de uso (`CreatePostCommand.Handler`, `FindPostQuery.Handler`, `OnPostUpdatedSubscription.Handler`).

Duas notas de quem implementou. A primeira: o namespace **não** pode declarar um membro chamado `Command` ou `Query` — o nome sombrearia o import do @nestjs/cqrs dentro dele e a classe herdaria de si mesma (`TS2506`); daí `CreatePostCommand.CreatePost` e não `CreatePost.Command`. A segunda é o preço: em runtime todos os handlers se chamam `Handler`, então um erro de injeção do Nest sai como *"can't resolve dependencies of the Handler (?)"* sem dizer qual — a dependência que faltou e o arquivo do stack trace continuam lá, mas o nome da classe deixou de ajudar. (Declarar a classe com nome descritivo e reexportá-la como `Handler` resolveria; o SWC não aceita `export { X as Y }` dentro de um namespace.)

**Uma request, uma cadeia — e a chave é o `PostId`.** O fork do EntityManager resolve a metade *transacional* do `ProcessingContext` do Axon; a outra metade é a **identidade** do pedido, e essa é o [request scoping/propagation](https://docs.nestjs.com/recipes/cqrs#request-scoping) do @nestjs/cqrs. Na versão Java, `@TargetEntityId PostId postId` no command roteava para o stream e `@EventTag` marcava os eventos com o mesmo id: uma chave gerada na borda (`PostId.newId()`) atravessava o pedido inteiro e amarrava os fatos uns aos outros. Aqui a chave é a mesma — o `PostId` que o `PostInputMapper` gera —, e quem a carrega é uma `PostRequest extends AsyncContext`:

```ts
// a borda cria a request; a chave é o id do command
await this.commandBus.execute(command, new PostRequest(command.postId));

// o handler é resolvido no ContextId dela, e a repassa aos eventos
@CommandHandler(CreatePostCommand, { scope: Scope.REQUEST })
export class CreatePostCommandHandler {
  constructor(..., @Inject(REQUEST) private readonly request: AsyncContext) {}
  // publisher.mergeObjectContext(post, this.request) → o EventBus carimba cada evento
}

// a saga recebe a request de volta pelo evento, e a leva aos commands que despacha
const request = PostRequest.of(event) ?? new PostRequest(PostId.parse(event.postId));
await this.commandBus.execute(new CreateTagCommand(tagId, DEFAULT_TAG_NAME), request);
request.attachTo(new AssignTagToPostCommand(request.postId, tagId));
```

O `AsyncContext` é duas coisas ao mesmo tempo, e as duas importam: um **`ContextId` do Nest** (os buses o registram com `registerRequestByContextId` antes de resolver o handler, então `@Inject(REQUEST)` entrega *aquele* objeto) e um **carimbo na mensagem** (`attachTo` define uma propriedade não-enumerável, sob um símbolo, no próprio command ou evento). O segundo ponto é o que mantém a chave como **metadado, e não payload**: o evento continua sendo primitivos e estado resultante, contrato que atravessa processo, e o `PostId` como value object anda por fora — a distinção do Axon entre o payload e a `MetaData` de correlação. Sendo não-enumerável, o carimbo nem aparece no `toEqual` de um evento.

O ganho concreto está na saga: ela deixa de reconstruir a identidade do post do primitivo do evento (`PostId.parse(event.postId)`) e passa a **receber** o value object que a borda gerou — o `parse` sobra como fallback, para um evento sem request (um replay, um teste que alimenta a saga direto). E a propagação atravessa agregado: o `CreateTagCommandHandler` roda na request do *post* que pediu a tag, então o `TagCreatedEvent` nasce na mesma cadeia que o `PostCreatedEvent` e o `PostUpdatedEvent`.

As queries ficam de fora de propósito: uma leitura não abre cadeia causal, e o contexto de que ela precisa é o do ORM (`@EnsureRequestContext`). Os handlers de command tipam a request pela base `AsyncContext`, não por `PostRequest` — um command handler *propaga* o contexto, não o interpreta; quem lê o `postId` é a saga, e um command despachado sem request (um `commandBus.execute` de uma linha) chega com o contexto anônimo que o próprio `CommandBus` cria.

**Salvar, depois publicar.** `await this.posts.save(post); post.commit();` — nessa ordem. O `flush` é a transação; `commit()` publica no `EventBus` depois que ela fechou. Quem ouve (saga, subscriptions) só é avisado quando o post já está no banco — o "emit sai depois do commit" do Axon.

**Consistência eventual, de verdade.** No Axon, `context.onAfterCommit(...)` devolvia um `CompletableFuture` e o framework **esperava** por ele antes de completar o `send` — por isso a mutation devolvia o post já com a tag. O `EventBus` do Nest publica e segue; a saga roda depois, na sua própria unidade de trabalho. `createPost` devolve o post como nasceu (v1, sem tags) e o cliente vê a tag chegar pelo `onPostUpdated` — que é a ordem em que os fatos aconteceram. O e2e trata isso como comportamento, não como flakiness: assina antes de criar e espera o evento.

**A saga serializa e sobrevive.** `concatMap` (não `mergeMap`) em `AssignDefaultTagOnPostCreated`: dois posts criados ao mesmo tempo não disputam a criação da tag `Untagged`. E `catchError` **por evento**: o `EventBus` do @nestjs/cqrs faz `catchError(... return of())` no stream da saga inteira — um erro não tratado completa o stream, e nenhum post futuro ganharia tag. O teste `survives a failure on one post` derruba o `findByName` uma vez e confere que o post seguinte é servido.

**Value objects como schemas Zod branded.** `PostTitle = z.string().trim().min(1).max(200).brand<'PostTitle'>()`. Só o `parse` produz o tipo, então um `PostTitle` que existe é sempre válido — o mesmo contrato do `record` com construtor canônico, sem classe. `Post.create` valida os três de uma vez (`z.object({ title, content, author })`) e traduz o `ZodError` em `InvalidPostException` com `z.prettifyError`. Os handlers `on...` re-validam na fronteira (`PostTitle.parse(event.title)`), então a invariante roda também no replay. O que **não** roda é na hidratação do banco: a coluna `title` volta como `string` e o tipo branded é só do TypeScript.

**Tags como relação de verdade — e o que isso custou.** `Post.tags` é `Collection<Tag>`, um many-to-many com pivô `posts_tags`: o Post guarda o **agregado `Tag`**, não uma cópia de id + nome. A versão anterior usava um embeddable (`p.embedded(TagRef).array()`, uma coluna JSON na própria linha) pelo argumento clássico de DDD — agregado referencia agregado por identidade, e uma relação do ORM entre os dois abre cascatas e lazy loading atravessando a fronteira de consistência. A troca vale a pena por integridade referencial, por um rename de tag passar a aparecer nos posts, e por dar acesso ao `populate`/`dataloader` do ORM; e cobra três coisas que vale registrar.

**Primeiro: o ganho de dataloading é parcialmente circular.** Com as tags na linha não havia N+1 nenhum — N posts eram N linhas com as tags dentro. A relação *cria* o N+1 que o dataloader depois resolve. Na prática o caminho do GraphQL nem chega lá: o `MikroOrmPostRepository` popula (`populate: ['tags']`) no `findById` e no `findByCursor`, o que resolve tudo em uma consulta a mais. O `dataloader: DataloaderType.ALL` no config cobre o acesso preguiçoso que aparecer.

**Segundo: `decidir → evoluir` entra em atrito com a relação.** O evento carrega primitivos (`{ tagId, name }`) — isso não mudou, e é o que deixa a subscription `onPostUpdated` montar a `PostView` do payload sem tocar o banco dentro de um WebSocket. Mas de primitivos não se materializa um agregado: o evento devolve **ids**, e o `Tag` como objeto só existe se alguém o trouxe. Por isso `assignTag` põe a Tag na coleção **antes** de levantar o evento, e `onPostUpdatedEvent` remonta a lista reaproveitando o que a coleção já tem (`rel()` cobre só o que faltar). O evento continua mandando na participação — quem não estiver nele sai; os objetos apenas sobrevivem à travessia.

A saída que *parece* óbvia não funciona, e vale saber por quê: confiar no identity map. `EntityFactory.createReference` de fato consulta `unitOfWork.getById(...)` antes de fabricar um stub, mas aquele `unitOfWork` não é o da request — `rel()` chega ao factory por `entityType.prototype.__factory`, e o `EntityHelper.decorate` o prende, **uma vez, na descoberta**, a um `em.fork()` dedicado guardado como campo privado. Medido: dentro do mesmo fork que acabou de carregar a Tag, `em.getReference(Tag, id).name` é `'Untagged'` e `rel(Tag, id).name` é `undefined`. Um eager load no command não muda isso. O que resta como limitação é o replay puro (`loadFromHistory` num Post novo): os ids voltam, os nomes não — reidratá-los exige um EntityManager, que o domínio não tem.

**Terceiro: o domínio deixou de rodar sem o ORM.** Uma `Collection` descobre a que propriedade pertence lendo a metadata do dono (`Collection.property` → `wrap(owner).__meta`), então qualquer `add`/`set` numa entidade não descoberta estoura `MetadataError`. O `post.entity.spec` passou a inicializar um MikroORM só para a descoberta — sem `ensureDatabase`, sem tabela, sem leitura. Não há como evitar: `propagationOnPrototype: false` não serve, porque a flag é lida do config de um ORM **já inicializado** (`EntityHelper`) e não passa perto desse getter.

O `Post.tags(first, after)` do schema não mudou: o `PostViewMapper` achata a coleção populada para a `PostView`, e o `PostTagsResolver` continua recortando em memória. O `schema.gql` é byte a byte o mesmo.

**Cursor connection montada pelo ORM.** `posts(first, after)` é `em.findByCursor(Post, { first, after, orderBy: { createdAt: 'asc', id: 'asc' } })`. O `Cursor` devolvido já traz `items`, `hasNextPage`, `startCursor`/`endCursor` e `from(entidade)` para o cursor de cada edge; o resolver só monta o shape. A ordenação é `createdAt, id` porque `createdAt` sozinho não é único. Os tipos `PostConnection`/`PostEdge`/`PageInfo` vêm de `Connection(classRef, name)`, a função-mixin de tipos genéricos da documentação do @nestjs/graphql. As tags usam `Cursor.encode`/`Cursor.decode` do próprio MikroORM para os cursores, então as duas connections falam o mesmo dialeto.

**Portas como classes abstratas.** `PostRepository` e `TagRepository` são `abstract class`, não `interface`: no Nest a classe é ao mesmo tempo o contrato e o token de injeção (`{ provide: PostRepository, useClass: MikroOrmPostRepository }`), sem `@Inject('TOKEN')`.

**Uma altura de validação.** A versão Java validava na borda (Bean Validation) e no domínio. Aqui só o domínio valida: `CreatePostInput` é o shape do protocolo e nada mais, e o `DomainExceptionFilter` faz um `InvalidPostException` chegar ao cliente como `BAD_USER_INPUT` com a mensagem do value object. O único `parse` fora do domínio é o do `PostId` no `PostInputMapper` — um id que não é UUID nem vira command.

**Exception filter que devolve, não escreve.** Num resolver GraphQL, um `ExceptionFilter` não escreve resposta: **devolve** o erro, e o @nestjs/graphql o lança de volta para o graphql-js, que o coloca em `errors[]`. `includeStacktraceInErrorResponses: false` no Apollo mantém `extensions` só com o `code`.

## Pegadinhas de versão (setembro de 2026)

- **MikroORM 7 é ESM-only.** A app roda em CommonJS porque o Node 22 faz `require(esm)`; o Jest não — daí Vitest + `unplugin-swc`, que é a receita do próprio Nest para SWC. Os decorators do ORM (`@CreateRequestContext`, `@Transactional`) moram em `@mikro-orm/decorators/legacy` (TypeScript `experimentalDecorators`) — o pacote `es` é para os decorators do TC39.
- **TypeScript 7 não tem API programática.** O Nest CLI recusa; o `package.json` pina `typescript@^6`. O `tsconfig.build.json` precisa de `rootDir` explícito (TS 6).
- **graphql 16.** O `@nestjs/graphql` 14 aceita 16 e 17; ficou o 16 por compatibilidade com o ecossistema de subscriptions.

## Próximos passos possíveis

- Event store de verdade: trocar o `DefaultPubSub` por um `IEventPublisher` que apende antes de publicar (`eventPublisher` nas opções do `CqsrsModule`, repassadas ao `CqrsModule`), e `loadFromHistory` no repositório — o domínio já suporta replay.
- Subscriptions entre processos: o `SubscriptionBus` já compartilha stream por chave dentro do processo; com mais de uma instância, o passo é um handler que ligue a mensagem a um stream distribuído (Redis, NATS) em vez do `EventBus` local — nada além do handler muda.
- Mutations de tag (`createTag`, `assignTag`, `removeTag`) — command e agregado já existem; falta o `@Mutation`.
- Projeção nos event handlers (tirar o `save` do command) para recuperar o read model derivado do stream.
- Backpressure no helper (descartar ou limitar a fila) para assinantes lentos.
- Paginação por keyset também em `Post.tags`, se as tags virarem relação.
