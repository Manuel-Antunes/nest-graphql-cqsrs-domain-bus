# nest-graphql-posts

POC: **NestJS 12** + **@nestjs/cqrs 12** + **MikroORM 7** + **@nestjs/graphql 14 (Apollo)** com subscriptions GraphQL alimentadas **pelo próprio `EventBus` do CQRS**, numa API DDD de posts e tags. É a reescrita em TypeScript do [axon-graphql-posts](https://github.com/Manuel-Antunes/axon-graphql-posts) (Axon Framework 5 + Reactor + Spring GraphQL), com a mesma estrutura e o mesmo schema.

A ideia central: o `EventBus` do @nestjs/cqrs **é um `Observable`** do RxJS (um `Subject` por baixo) — o mesmo objeto em que os event handlers e as sagas se inscrevem. Uma subscription GraphQL é, no fundo, "devolva um async iterator". Então uma *subscription* é uma *query* cujo resultado é o `EventBus` filtrado por `ofType(...)`, e a única cola necessária é transformar esse `Observable` em `AsyncIterator`. O filtro por tópico (`onPostUpdated(postId)`) é o [`filter` nativo do `@Subscription`](https://docs.nestjs.com/graphql/subscriptions#filtering-subscriptions), avaliado por assinante.

Estado em **SQLite** via MikroORM; event store em memória (o próprio `EventBus`).

```
mutation createPost(input) ──► PostInputMapper.toCreateCommand(input)     [protocolo → command; gera o PostId]
                              │
                              ▼
                  CreatePostCommandHandler  @CreateRequestContext()      [aplicação — uma classe por command,
                     │                                                    um fork do EntityManager por command]
                     ├─► Post.create(...)   [domínio — valida (Zod), apply(PostCreatedEvent) → onPostCreatedEvent]
                     ├─► PostRepository.save(post)                       [persist + flush = uma transação]
                     └─► post.commit()      [publica os eventos não-commitados no EventBus — DEPOIS de salvar]
                              │
                              ▼
                  EventBus (Subject do RxJS) ── ofType(PostCreatedEvent) ──┬─► OnPostCreatedSubscriptionHandler
                     │                                                    │      └─► PostView do payload ──► onPostCreated
                     │                                                    └─► AssignDefaultTagOnPostCreated (@Saga)
                     │                                                           ├─► tag "Untagged" no banco? não ──► CommandBus.execute(CreateTagCommand)
                     │                                                           └─► emite AssignTagToPostCommand ──► EventBus o executa
                     │                                                                    └─► Post.assignTag(...) ──► PostUpdatedEvent (com a tag)
                     └── ofType(PostUpdatedEvent) ──► OnPostUpdatedSubscriptionHandler ──► PostView do payload
                                                                    │
                                                                    ▼
                  PostSubscriptionResolver: observableToAsyncIterable(stream) ──► @Subscription({ filter, resolve })
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
│   │   ├── vo/tag-ref                           #   embeddable do MikroORM, gravado como JSON na linha do post
│   │   ├── event/post-created.event, post-updated.event   # payload primitivo; estado resultante completo
│   │   └── exception/invalid-post, post-not-found, post-already-exists
│   └── tag
│       ├── tag.entity, tag.repository, vo/tag-id, tag-name
│       ├── event/tag-created.event
│       └── exception/invalid-tag, tag-not-found, tag-already-exists
├── application                                  # orquestra: carrega, decide pelo domínio, salva, publica
│   ├── post
│   │   ├── command/create-post, update-post, assign-tag-to-post   (.command + .handler cada)
│   │   ├── event/assign-default-tag-on-post-created.saga           # OUVE PostCreated, despacha commands
│   │   ├── query/find-post, find-all-posts                        (.query + .handler cada)
│   │   └── subscription/on-post-created, on-post-updated          # Query<Observable<evento>> + handler que liga ao EventBus
│   └── tag/command/create-tag (.command + .handler)
├── infrastructure/persistence/sqlite            # escolhas de deploy; nenhuma regra de negócio
│   ├── mikro-orm.config                         #   SQLite, ensureDatabase, POSTS_DB
│   └── mikro-orm-post.repository, mikro-orm-tag.repository       # adapters das portas (findByCursor aqui)
└── interfaces/graphql
    ├── post-query.resolver, post-mutation.resolver, post-subscription.resolver
    ├── post-tags.resolver                       #   campo Post.tags: cursor connection recortada em memória
    └── observable-to-async-iterable             #   O helper. Observable → AsyncIterableIterator
```

Schema gerado (code-first) em `schema.gql` na subida.

## Do Axon 5 pro @nestjs/cqrs (e por que está assim)

| Axon 5 (versão Java) | @nestjs/cqrs 12 (este projeto) |
|---|---|
| `@EventSourced` + `@EntityCreator` + `@EventSourcingHandler` | `WithAggregateRoot(BaseEntity)`: `apply(evento)` chama `on<Evento>(evento)`; `loadFromHistory` é o replay |
| `events.raise(evento)` pela porta `DomainEventPublisher` + `EventAppender` | `this.apply(evento)` guarda em `getUncommittedEvents()`; `EventPublisher.mergeObjectContext(post)` liga `commit()` ao `EventBus` |
| `@CommandHandler` em classe própria, `@InjectEntity Post` | `@CommandHandler(Cmd)` em classe própria; o handler carrega pelo repositório |
| `ProcessingContext` por command (evento + linha commitam juntos) | `@CreateRequestContext()` do MikroORM: um fork do EntityManager por command; `flush` é a transação; `commit()` vem depois |
| `@EventHandler` + `ProcessingContext.onAfterCommit(...)` despachando commands | `@Saga()`: `Observable<evento> → Observable<command>`, o `EventBus` executa o que sai |
| `subscriptionQuery` + `QueryUpdateEmitter.emit(...)` | `Query<Observable<evento>>` cujo handler devolve `eventBus.pipe(ofType(Evento))` |
| `Flux` no `@SubscriptionMapping` + SSE | `observableToAsyncIterable(stream)` no `@Subscription` + graphql-ws |
| filtro por tópico avaliado no `emit` (`sub -> sub.matches(id)`) | `@Subscription({ filter: (payload, variables) => ... })` do @nestjs/graphql |
| `ScrollSubrange` / `Window` do Spring Data | `em.findByCursor` do MikroORM: itens + `hasNextPage` + cursores prontos |
| `@Embeddable record` com validação no construtor | schema Zod `.brand<'PostTitle'>()`: só o `parse` produz o tipo |
| `@ElementCollection(LAZY)` + DataLoader | `p.embedded(TagRef).array()` — JSON na própria linha; não há N+1, não há DataLoader |
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

- `post.entity.spec` / `tag.entity.spec` — domínio puro. O único colaborador é o próprio aggregate root: `getUncommittedEvents()` diz exatamente o que foi disparado, sem `EventPublisher`, sem `EventBus`, sem ORM. Os testes `the state returned by update is the same as sourcing the raised events` (via `loadFromHistory`) e `applying the same event twice leaves the same state` travam o contrato decidir/evoluir.
- `create-post.handler.spec`, `update-post.handler.spec`, `assign-tag-to-post.handler.spec`, `create-tag.handler.spec` — um por handler, com `@nestjs/testing`. O fixture (`test/support/cqrs-testing-module.ts`) monta o `CqrsModule` de verdade, o MikroORM de verdade num SQLite em memória, os repositórios — e **só o handler do teste**, então uma dependência acidental entre dois deles quebra o teste. Não há repositório fake: como salvar é responsabilidade do command, o banco é quem prova que ele salvou, e um `RecordingEvents` pendurado no `EventBus` prova o que ele publicou.
- `find-all-posts.handler.spec` — a mecânica da cursor connection de `posts`: a linha a mais que decide o `hasNextPage` nunca vaza, o `endCursor` de uma página é o `after` da seguinte.
- `assign-default-tag-on-post-created.saga.spec` — a saga é uma função `Observable → Observable`: alimenta-se um `of(evento)` e colhem-se os commands. Cria a tag quando não existe, reusa quando existe, serializa dois posts criados ao mesmo tempo, e **sobrevive a uma falha** (sem o `catchError` por evento, o `EventBus` completaria o stream e nenhum post futuro ganharia tag).
- `post-tags.resolver.spec` — o recorte em memória de `Post.tags`, que é a parte da connection que é lógica nossa.
- `observable-to-async-iterable.spec` — o helper: entrega em ordem, `return()` cancela a inscrição **mesmo com um `next()` pendente**, erro propaga, um assinante GraphQL = uma inscrição no `EventBus`.
- `domain-exception.filter.spec` — a tabela exceção → `extensions.code`.
- `posts.e2e-spec` — o smoke test como teste: sobe o `AppModule` com SQLite em memória (`POSTS_DB` no `vitest.e2e.config.mts`), fala HTTP para queries/mutations e graphql-ws para subscriptions. Confere a ordem command → evento → entrega, a chegada da tag padrão por `onPostUpdated`, o filtro por tópico (o assinante filtrado vê só o seu post; o global vê tudo), os erros com código, as duas connections — e que desassinar tira o assinante do `EventBus` na hora, contando os `observers` do `Subject`.

## Decisões que valem comentar

**O `EventBus` é o emitter.** Não há `PubSub` do `graphql-subscriptions`, não há `Subject` novo, não há `@EventsHandler` que "emite" para as subscriptions. `ObservableBus` estende `Observable`, e `ofType` é o operador que o próprio @nestjs/cqrs exporta para as sagas. Uma subscription GraphQL ouve o mesmo stream que a saga da tag padrão. Cada assinante GraphQL é exatamente um `subscribe` no `Subject` — o e2e prova isso contando `eventBus.subject$.observers`.

**Subscription é uma query cujo resultado é um stream.** No Axon era uma *subscription query* devolvendo `Flux`. Aqui `OnPostUpdatedSubscription` estende `Query<Observable<PostUpdatedEvent>>` e o handler devolve `this.eventBus.pipe(ofType(PostUpdatedEvent))`. Funciona porque `QueryBus.execute` faz `await handler.execute(query)`, e um `Observable` não é *thenable* — chega inteiro do outro lado. Decidir quais eventos alimentam qual subscription é regra da aplicação; a interface só converte o stream para o transporte.

**Um helper, e por que ele existe.** `observableToAsyncIterable` é o único código de cola do projeto. A primeira versão era um `ReadableStream` do Node (async-iterável por natureza, dez linhas) — e vazava assinantes: `ReadableStream`, `stream.Readable` e `async function*` **serializam `return()` atrás de um `next()` pendente**. Uma subscription GraphQL passa a vida esperando o próximo evento; quando o cliente desconecta, o graphql-js chama `return()`, que só resolveria no próximo evento. Até lá o assinante continuava vivo no `EventBus`. Um iterador com fila explícita resolve os `next()` pendentes com `done: true` na hora — é a mesma mecânica do `PubSubAsyncIterableIterator` do `graphql-subscriptions`, ligada a um `Observable` em vez de a um PubSub.

**O `filter` do `@Subscription` é o filtro por tópico.** `onPostUpdated(postId)` não filtra o `Observable`: ele é o mesmo para todos. O filtro é a opção `filter` do decorator, que recebe o payload e as variáveis **daquele assinante**. O Apollo driver do Nest o aplica com o `createAsyncIterator` do @nestjs/graphql, que chama `next()`/`return()` direto no iterador — por isso o resolver devolve um `AsyncIterableIterator` (iterator que também é iterable) e não só um iterable. `resolve: (payload) => payload` diz ao graphql-js que o payload é o valor, em vez de procurar `payload.onPostUpdated`.

**Por que Apollo, e não Mercurius.** A POC começou com Mercurius (Fastify), e tudo funcionava — inclusive o filtro. A diferença apareceu no desassinar: o `withFilter` do Mercurius é um `async function*` com `yield*`, e um async generator só processa `return()` depois que o `next()` pendente resolve. Um assinante filtrado que desconectava ficava pendurado no `EventBus` até o próximo `PostUpdatedEvent`. O `withFilter` do caminho Apollo é um iterador explícito; a inscrição cai na hora. Para uma POC sobre subscriptions, a limpeza imediata pesou mais que o Fastify.

**Uma classe por entidade, e o mixin no lugar certo.** `Post` é a entidade de domínio, o aggregate root do @nestjs/cqrs e o mapeamento do MikroORM (`PostSchema = defineEntity({ class: Post, ... })`), numa classe só. A base é `AggregateEntity = WithAggregateRoot(BaseEntity)`: a entidade já precisa herdar do `BaseEntity` do ORM, então `extends AggregateRoot` não serve — é exatamente o cenário para o qual o mixin existe. Uma constante compartilhada, e não um `WithAggregateRoot(...)` por entidade, porque o MikroORM descobre a classe-pai de cada entidade como entidade abstrata, e duas classes anônimas de nome `AggregateRoot` seriam ambíguas para ele. (Tentei antes `class Post extends WithAggregateRoot(PostSchema.class)` com `setClass`: a classe intermediária do mixin entra na cadeia de protótipos e a descoberta do ORM entra em loop — `Post extends AggregateRoot extends Post`.)

**`forceConstructor: true`.** O MikroORM hidrata entidades por `Object.create(prototype)`, sem chamar o construtor — e é no construtor que o mixin inicializa a lista de eventos não-commitados. Sem isso, um `post.apply(...)` numa entidade carregada do banco explode. Com `forceConstructor` no schema, um Post que volta do banco nasce pelo `new` e chega inteiro; o `create-post.handler.spec` confere que ele volta com `getUncommittedEvents()` vazio.

**Um fork do EntityManager por command.** `@CreateRequestContext()` em todo command handler. Sem ele, um command despachado pela saga herda (pelo `AsyncLocalStorage`) o contexto da request HTTP que publicou o evento, e dois fluxos concorrentes dividem o mesmo identity map — o post que a mutation lê de volta e o que a saga está mutando seriam o mesmo objeto. É o `ProcessingContext` por command do Axon, dito com a ferramenta do ORM. As queries usam `@EnsureRequestContext()`: rodam no contexto da request quando há um, e criam o seu quando não há (teste, WebSocket). O preço é o handler receber `EntityManager` no construtor só para o decorator achar `this.em`.

**Salvar, depois publicar.** `await this.posts.save(post); post.commit();` — nessa ordem. O `flush` é a transação; `commit()` publica no `EventBus` depois que ela fechou. Quem ouve (saga, subscriptions) só é avisado quando o post já está no banco — o "emit sai depois do commit" do Axon.

**Consistência eventual, de verdade.** No Axon, `context.onAfterCommit(...)` devolvia um `CompletableFuture` e o framework **esperava** por ele antes de completar o `send` — por isso a mutation devolvia o post já com a tag. O `EventBus` do Nest publica e segue; a saga roda depois, na sua própria unidade de trabalho. `createPost` devolve o post como nasceu (v1, sem tags) e o cliente vê a tag chegar pelo `onPostUpdated` — que é a ordem em que os fatos aconteceram. O e2e trata isso como comportamento, não como flakiness: assina antes de criar e espera o evento.

**A saga serializa e sobrevive.** `concatMap` (não `mergeMap`) em `AssignDefaultTagOnPostCreated`: dois posts criados ao mesmo tempo não disputam a criação da tag `Untagged`. E `catchError` **por evento**: o `EventBus` do @nestjs/cqrs faz `catchError(... return of())` no stream da saga inteira — um erro não tratado completa o stream, e nenhum post futuro ganharia tag. O teste `survives a failure on one post` derruba o `findByName` uma vez e confere que o post seguinte é servido.

**Value objects como schemas Zod branded.** `PostTitle = z.string().trim().min(1).max(200).brand<'PostTitle'>()`. Só o `parse` produz o tipo, então um `PostTitle` que existe é sempre válido — o mesmo contrato do `record` com construtor canônico, sem classe. `Post.create` valida os três de uma vez (`z.object({ title, content, author })`) e traduz o `ZodError` em `InvalidPostException` com `z.prettifyError`. Os handlers `on...` re-validam na fronteira (`PostTitle.parse(event.title)`), então a invariante roda também no replay. O que **não** roda é na hidratação do banco: a coluna `title` volta como `string` e o tipo branded é só do TypeScript.

**Tags como JSON na linha, e por isso sem DataLoader.** `p.embedded(TagRef).array()` vira uma coluna `tags` JSON em `posts`. N posts numa resposta são N linhas com as tags dentro — não há N+1 a evitar, e o campo `Post.tags(first, after)` só recorta em memória. Se um dia as tags virarem uma relação de verdade, a resposta nativa é o `dataloader: DataloaderType.ALL` do MikroORM, que junta os `load()` de uma mesma rodada numa consulta só; a fronteira do resolver não mudaria.

**Cursor connection montada pelo ORM.** `posts(first, after)` é `em.findByCursor(Post, { first, after, orderBy: { createdAt: 'asc', id: 'asc' } })`. O `Cursor` devolvido já traz `items`, `hasNextPage`, `startCursor`/`endCursor` e `from(entidade)` para o cursor de cada edge; o resolver só monta o shape. A ordenação é `createdAt, id` porque `createdAt` sozinho não é único. Os tipos `PostConnection`/`PostEdge`/`PageInfo` vêm de `Connection(classRef, name)`, a função-mixin de tipos genéricos da documentação do @nestjs/graphql. As tags usam `Cursor.encode`/`Cursor.decode` do próprio MikroORM para os cursores, então as duas connections falam o mesmo dialeto.

**Portas como classes abstratas.** `PostRepository` e `TagRepository` são `abstract class`, não `interface`: no Nest a classe é ao mesmo tempo o contrato e o token de injeção (`{ provide: PostRepository, useClass: MikroOrmPostRepository }`), sem `@Inject('TOKEN')`.

**Uma altura de validação.** A versão Java validava na borda (Bean Validation) e no domínio. Aqui só o domínio valida: `CreatePostInput` é o shape do protocolo e nada mais, e o `DomainExceptionFilter` faz um `InvalidPostException` chegar ao cliente como `BAD_USER_INPUT` com a mensagem do value object. O único `parse` fora do domínio é o do `PostId` no `PostInputMapper` — um id que não é UUID nem vira command.

**Exception filter que devolve, não escreve.** Num resolver GraphQL, um `ExceptionFilter` não escreve resposta: **devolve** o erro, e o @nestjs/graphql o lança de volta para o graphql-js, que o coloca em `errors[]`. `includeStacktraceInErrorResponses: false` no Apollo mantém `extensions` só com o `code`.

## Pegadinhas de versão (setembro de 2026)

- **MikroORM 7 é ESM-only.** A app roda em CommonJS porque o Node 22 faz `require(esm)`; o Jest não — daí Vitest + `unplugin-swc`, que é a receita do próprio Nest para SWC. Os decorators do ORM (`@CreateRequestContext`, `@Transactional`) moram em `@mikro-orm/decorators/legacy` (TypeScript `experimentalDecorators`) — o pacote `es` é para os decorators do TC39.
- **TypeScript 7 não tem API programática.** O Nest CLI recusa; o `package.json` pina `typescript@^6`. O `tsconfig.build.json` precisa de `rootDir` explícito (TS 6).
- **graphql 16.** O `@nestjs/graphql` 14 aceita 16 e 17; ficou o 16 por compatibilidade com o ecossistema de subscriptions.

## Próximos passos possíveis

- Event store de verdade: trocar o `DefaultPubSub` do `CqrsModule` por um `IEventPublisher` que apende antes de publicar (`CqrsModuleOptions.eventPublisher`), e `loadFromHistory` no repositório — o domínio já suporta replay.
- Mutations de tag (`createTag`, `assignTag`, `removeTag`) — command e agregado já existem; falta o `@Mutation`.
- Projeção nos event handlers (tirar o `save` do command) para recuperar o read model derivado do stream.
- Backpressure no helper (descartar ou limitar a fila) para assinantes lentos.
- Paginação por keyset também em `Post.tags`, se as tags virarem relação.
