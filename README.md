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
| `@nestjs/graphql` + `@nestjs/apollo` + `@apollo/server` | 14.x / 5.x — schema-first (`typePaths`), subscriptions por `graphql-ws` |
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
├── graphql                                      # O SCHEMA: a definição do protocolo, carregada por typePaths
│   │                                            #   asset copiado para dist/ pelo nest-cli (assets + watchAssets)
│   ├── scalars, pagination                      #   vocabulário compartilhado: DateTime, PageInfo
│   ├── post, tag                                #   os tipos e suas connections (Post não declara tags aqui)
│   ├── user                                     #   interface User + type Reader/Author (o polimorfismo do domínio)
│   ├── post-query, post-mutation, user-query    #   type Query / type Mutation + inputs ↔ um resolver cada
│   └── post-subscription, post-tags,            #   type Subscription / extend type Post { tags }
│       post-author, author-posts                #   extend type Post { author } / extend type Author { posts }
├── dto/graphql                                  # a forma do dado NO PROTOCOLO — sem UM decorator de GraphQL
│   │                                            #   todos gerados por ValidatedDto(schema) + @InheritValidatedMetadata,
│   │                                            #   embutindo os MESMOS value objects do domínio (PostId.field() etc.)
│   ├── create-post.input, update-post.input     #   entrada: espelham os input do schema
│   ├── post.view, tag.view                      #   saída: campos são value objects; a serialização os colapsa
│   │                                            #   post.view leva authorId (não o nome): Post.author é resolvido
│   ├── user.view                                #   ReaderView/AuthorView + UserView (a união: o sealed interface)
│   └── connection, post.connection              #   PageInfo + ConnectionType<T> + connectionOf(Cursor) → Post/TagConnection
├── validated-dto                                # o mixin que gera as classes de DTO a partir de um schema Zod
│   ├── mixins/validated-dto.mixin               #   ValidatedDto(objeto|união) + .Embeddable (VO de vários campos)
│   ├── mixins/validated-scalar.mixin            #   ValidatedDto.Scalar: VO de um valor só (toString/equals/parse/field)
│   └── schemas/registries                       #   decorators (os que o campo pendura no schema) + embedded (schema → VO)
├── mapper                                       # TODO mapeamento do projeto
│   ├── post-input.mapper                        #   input GraphQL → command   (protocolo → aplicação)
│   ├── post-view.mapper                         #   Post | evento → PostView  (domínio → protocolo)
│   └── user-view.mapper                         #   User → Reader/AuthorView  (despacho pelo TIPO, à mão)
│
├── domain                                       # regras e invariantes; NENHUM mapeamento (ver infrastructure)
│   ├── shared/domain-event, aggregate-entity    #   marcador dos fatos + AggregateEntity = WithAggregateRoot(BaseEntity)
│   ├── shared/soft-delete                       #   SoftDeletion (@Embeddable) + WithSoftDelete (o mixin)
│   ├── shared/already-deleted, not-deleted      #   as duas guardas do mixin, compartilhadas
│   ├── post
│   │   ├── post.entity                          #   Post: entidade de domínio E aggregate root, numa classe só
│   │   │                                        #     decidir: create()/update()/assignTag() → apply(evento)
│   │   │                                        #     evoluir: onPostCreatedEvent()/onPostUpdatedEvent(), idempotentes
│   │   ├── post.repository                      #   porta (classe abstrata = token de injeção)
│   │   ├── vo/post-id, post-title, post-content #   value objects: classes de ValidatedDto.Scalar
│   │   │                                        #     tags: Collection<Tag> — relação m:n (pivô posts_tags)
│   │   ├── event/post-created.event, post-updated.event   # payload primitivo; estado resultante completo
│   │   └── exception/invalid-post, post-not-found, post-already-exists
│   ├── user                                     #   agregado polimórfico, herança multi-tabela
│   │   ├── user.entity                          #     a raiz ABSTRATA; não conhece as subclasses
│   │   ├── reader.entity, author.entity         #     os tipos concretos, um por arquivo
│   │   │                                        #       Author.posts: coleção inversa, paginada, nunca carregada
│   │   ├── user.factory                         #     Users.register/fromHistory: o papel decide a classe
│   │   ├── identity.provider                    #     PORTA do provedor de identidade: findById + grantRole
│   │   │                                        #       (Identity = credentialId, email, name, role)
│   │   └── user.repository, vo/user-id, email, user-name, credential-id
│   └── tag
│       ├── tag.entity, tag.repository, vo/tag-id, tag-name
│       ├── event/tag-created.event
│       └── exception/invalid-tag, tag-not-found, tag-already-exists
├── application                                  # orquestra: carrega, decide pelo domínio, salva, publica
│   ├── post
│   │   ├── command/create-post, update-post, assign-tag-to-post   # um .command.ts por fatia: dentro do
│   │   │                                                          #   namespace, a mensagem E o Handler dela
│   │   ├── event/assign-default-tag-on-post-created.saga           # OUVE PostCreated, despacha commands
│   │   ├── query/find-post, find-all-posts,                        # idem, num .query.ts por fatia
│   │   │         find-posts-by-author                              #   o que serve o campo Author.posts
│   │   └── subscription/on-post-created, on-post-updated          # idem: Subscription<evento, critério> com o
│   │                                                              #   filter + o @SubscriptionHandler, num .subscription.ts
│   ├── shared/post-request                                        # PostRequest extends AsyncContext: a chave (o PostId)
│   │                                                              #   que atravessa command → eventos → saga → commands
│   └── tag/command/create-tag                                     # idem
│   └── user/query/find-author                                     # o autor de um post, para o campo Post.author
├── infrastructure/auth                          # o provedor de identidade, e só ele conhece o Better Auth
│   ├── auth                                     #   authOptions: plugins, accountLinking, databaseHooks
│   ├── better-auth.schema                       #   as 12 tabelas dele, geradas de getAuthTables
│   ├── better-auth-identity.provider            #   ADAPTER da porta, sobre o internalAdapter
│   └── identity.module                          #   liga porta ↔ adapter (o irmão do PersistenceModule)
├── infrastructure/persistence/sqlite            # escolhas de deploy; nenhuma regra de negócio
│   ├── mikro-orm.config                         #   SQLite, ensureDatabase, POSTS_DB, subscribers
│   ├── entities                                 #   O MAPEAMENTO: defineEntity apontando para a classe
│   │   ├── post-orm, tag-orm, user-orm          #     de domínio — coluna, tipo, índice, relação
│   │   └── soft-delete-orm                      #     o @Embedded do soft delete + o filtro `active`
│   ├── repositories                             #   adapters das portas (findByCursor e restore aqui)
│   │   └── mikro-orm-post/tag/user.repository
│   ├── helpers
│   │   ├── value-object-type                    #   a ponte VO ↔ coluna: um Type gerado da classe
│   │   └── soft-delete.subscriber               #   troca o DELETE por UPDATE deleted_at
│   └── ../request-context                       #   reaproveita o contexto do ORM, ou abre um — é o que faz
│                                                #     Post.author resolver dentro de um WebSocket

├── interfaces                                   # a borda, com as peças do Nest cada uma no seu lugar
│   ├── graphql
│   │   ├── post-query/mutation/subscription.resolver
│   │   ├── post-tags.resolver                   #   campo Post.tags: cursor connection recortada em memória
│   │   ├── post-author.resolver                 #   campo Post.author: authorId → Author (zero queries nas leituras)
│   │   ├── user-query.resolver                  #   a query me + o __resolveType da interface User
│   │   └── author-posts.resolver                #   campo Author.posts: cursor connection paginada no banco
│   ├── auth/user-provisioning.hooks             #   A OUTRA BORDA: o Better Auth chamando para dentro
│   │                                            #     @AfterCreate('user') → o perfil nasce no sign-up
│   │                                            #     @AfterUpdate('user') → o papel mudou, promove
│   ├── decorators/current-user                  #   @CurrentUser() e @CurrentAuthor(): @Session() + pipes
│   ├── pipes/session-user, author               #   sessão → User → Author (o upcast, e a guarda)
│   └── filters
│       ├── domain-exception.filter              #   exceções do domínio → GraphQLError com extensions.code
│       └── mikro-orm-exception.filter           #   violação de integridade → erro de usuário (nos resolvers)
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

Schema em `src/graphql/` — **schema-first**: o SDL é a definição, e não a saída. O `GraphQLModule` concatena os `.graphql` da pasta por `typePaths`, e os resolvers se ligam a eles pelo nome (`@Resolver('Post')`, `@Query('posts')`, `@ResolveField('tags')`). Um arquivo por responsabilidade, espelhando os resolvers. Nenhum DTO carrega decorator de GraphQL.

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
| `@Embeddable record PostTitle` com validação no construtor | `class PostTitle extends ValidatedDto.Scalar(schema)`: a regra fica no schema Zod, o comportamento (`toString`/`equals`/`parse`) na classe |
| `@Embedded PostTitle title` numa entidade / num DTO | `p.type(valueObjectType(PostTitle, …))` na coluna; `PostTitle.field()` no shape do DTO. O banco continua vendo texto |
| `@Embeddable SoftDeletion` + `interface SoftDeletable` | `SoftDeletion` (embeddable) + `WithSoftDelete` (mixin de classe), com os mesmos dois pares decidir/evoluir |
| `@SQLRestriction("deleted_at is null")` + `@SQLDelete` | o filtro `active` (ligado por padrão no schema) + o `SoftDeleteSubscriber` — as duas peças que o MikroORM oferece |
| `@ManyToOne(optional = false) Author author` | `Ref<Author>` no `Post.create` **e** a FK apontando para `authors(id)`: um Reader não passa nem pelo tipo nem pelo banco |
| `Post.author: Author!` por `@BatchMapping` + DataLoader a partir do `authorId` do `PostView` | `@ResolveField('author')` → `QueryBus` → `findById`. Sem DataLoader, e sem N+1 na leitura: o repositório já popula o autor, então o identity map serve a resolução em **zero** consultas (há um teste que as conta) |
| `@ElementCollection(LAZY)` + DataLoader | `p.manyToMany(TagSchema).owner()` — `Collection<Tag>` com pivô `posts_tags`; `populate` no repositório e `dataloader: DataloaderType.ALL` no config |
| `ClassNameTypeResolver` num `@Bean` (`ReaderView` → `Reader`, `AuthorView` → `Author`) | um `__resolveType` no `@Resolver('User')`: o @nestjs/graphql o reconhece pelo nome e o pendura na interface |
| `@PreAuthorize("isAuthenticated()")` no `me` | o guard global do `@thallesp/nestjs-better-auth`: exigir sessão é o **padrão**, e as leituras de post são a exceção que opta por fora com `@AllowAnonymous()` |
| `Author.posts` por `@SchemaMapping` + DataLoader, recortado em memória | `@ResolveField('posts')` → `QueryBus` → `em.findByCursor` com `where: { author }`: a página é uma consulta com `limit`, não um recorte de tudo. Sem DataLoader porque `Post.author` é `String!`, então há **um** Author por resposta |
| MapStruct | `PostInputMapper` / `PostViewMapper` injetáveis, à mão; `UserViewMapper` também à mão, mas por outro motivo: o destino depende do **tipo em runtime** |
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
subscription { onPostCreated { id title version author { id name email } } }
```

Terminal 2 — dispara o command:

```bash
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation { createPost(input:{title:\"Nest + GraphQL\", content:\"oi\"}) { id title version author { id name } tags(first: 5) { edges { node { id name } } } } }"}'
```

O terminal 1 recebe `{"data":{"onPostCreated":{"id":"…","title":"Nest + GraphQL","version":1,"author":{"name":"manuel",…}}}}`.

`author` é o `type Author`, e não o nome: é o único campo de um payload de subscription que custa uma
consulta, porque o evento carrega `authorId` mas não o e-mail de quem escreveu. Pedir só
`onPostCreated { id title version }` não toca o banco, como antes.

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

`me` — quem está logado, e o casting pela interface. Exige sessão, então vai pelo GraphiQL (que manda o
cookie) ou com o cookie do sign-up na mão:

```graphql
me {
  __typename
  id
  name
  email
  # só casa para quem É um Author: a resposta vem da linha em `authors`, não de uma claim do token
  ... on Author {
    posts(first: 5) {
      edges { cursor node { id title version } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}
```

```bash
# sign-up (guarda o cookie), e então `me` com ele
curl -s -c /tmp/posts.cookie -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"manuel@example.com","name":"manuel","password":"senha-super-secreta"}'

curl -s -b /tmp/posts.cookie -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ me { __typename id name email ... on Author { posts(first: 5) { edges { node { title } } totalCount } } } }"}'
```

Recém-inscrito, o `__typename` é `Reader` e o fragmento não casa — **`posts` nem aparece na resposta**,
em vez de voltar vazio. Conceder o papel `author` (é o que o realm do Keycloak fazia na versão Axon)
promove o perfil, e o mesmo `me` passa a casar com `... on Author`.

Houve aqui um `pnpm smoke` — um script que buildava, subia a app com banco novo, abria subscriptions por
graphql-ws e conferia contagens. Ele saiu: tudo o que ele verificava está no `posts.e2e-spec`, que sobe a
mesma aplicação e fala o mesmo HTTP e o mesmo WebSocket, só que com asserções que falham com nome e
diff em vez de um `FAIL` numa linha de log. Dois roteiros para o mesmo caminho é um que envelhece sem
ninguém notar — e era o que estava a acontecer: o script ainda mandava `author` dentro do
`CreatePostInput`, campo que deixou de existir quando o autor passou a vir da sessão.

Uma coisa saiu com ele: o script rodava contra o `dist/main` **buildado**, numa porta de verdade. O e2e
sobe o `AppModule` em processo, então hoje **nada** verifica que o artefacto buildado arranca — o
`pnpm build` diz que compila e que os `.graphql` foram copiados, não que sobe.

## Testes

```bash
pnpm test        # unitários e de handler (src/**/*.spec.ts)
pnpm test:e2e    # a aplicação inteira, por HTTP + WebSocket (test/*.e2e-spec.ts)
pnpm test:all
```

- `post.entity.spec` / `tag.entity.spec` — domínio puro: sem `EventPublisher`, sem `EventBus`, sem banco. O único colaborador é o próprio aggregate root: `getUncommittedEvents()` diz exatamente o que foi disparado. O `post.entity.spec` inicializa um MikroORM **só para descoberta** (sem `ensureDatabase`, nenhuma tabela criada): desde que `Post.tags` virou relação, uma `Collection` precisa da metadata do dono para saber a que propriedade pertence. Os testes `the state returned by update is the same as sourcing the raised events` (via `loadFromHistory`) e `applying the same event twice leaves the same state` travam o contrato decidir/evoluir.
- `create-post.command.spec` — inclui os dois testes que tornam verificável a confiança na chave estrangeira: criar com um `authorId` inexistente e criar com o id de um **Reader** falham na FK, sem gravar nada. São eles que justificam o handler não reler o autor.
- `create-post.command.spec`, `update-post.command.spec`, `assign-tag-to-post.command.spec`, `create-tag.command.spec` — um por fatia, ao lado do arquivo que ela ocupa, com `@nestjs/testing`. O fixture (`test/support/cqrs-testing-module.ts`) monta o `CqsrsModule` de verdade, o MikroORM de verdade num SQLite em memória, os repositórios — e **só o handler do teste**, então uma dependência acidental entre dois deles quebra o teste. Não há repositório fake: como salvar é responsabilidade do command, o banco é quem prova que ele salvou, e um `RecordingEvents` pendurado no `EventBus` prova o que ele publicou. Como os handlers são `{ scope: Scope.REQUEST }`, o teste despacha pelo `CommandBus` com uma `PostRequest`: não existe "a" instância de um handler request-scoped para pegar do módulo — e esse é justamente o caminho de produção.
- `author.entity.spec` — os posts vistos do lado do autor, e sobretudo que a coleção **não** carrega tudo: depois de `posted()` e de `postCount()`, `posts.isInitialized()` continua `false`.
- `user-provisioning.service.spec` — o provisionamento e a **promoção** contra o banco: as duas linhas apontam uma para a outra, as referências resolvem para os tipos concretos (`Author`/`Reader`), e o stream encerrado deixa de contar como ativo. É o teste que pegou a ordem de gravação que a chave estrangeira passou a recusar. O provedor de identidade entra como `FakeIdentityProvider` — nenhum destes testes importa `better-auth`, que é o que a porta comprou.
- `find-all-posts.query.spec` — a mecânica da cursor connection de `posts`: a linha a mais que decide o `hasNextPage` nunca vaza, o `endCursor` de uma página é o `after` da seguinte.
- `assign-default-tag-on-post-created.saga.spec` — a saga é uma função `Observable → Observable`: alimenta-se um `of(evento)` e colhem-se os commands. Cria a tag quando não existe, reusa quando existe, serializa dois posts criados ao mesmo tempo, **sobrevive a uma falha** (sem o `catchError` por evento, o `EventBus` completaria o stream e nenhum post futuro ganharia tag), tira o `PostId` da request que veio carimbada no evento em vez do primitivo do payload, carimba o command que devolve com a mesma request — e cai no `PostId.parse` quando o evento chega sem request nenhuma.
- `post-request.spec` — a propagação de ponta a ponta, com os quatro command handlers e a saga no mesmo módulo: um `createPost` abre uma cadeia de três eventos por três handlers request-scoped diferentes, dois deles despachados pela saga, e os três saem carimbados com **o mesmo objeto**. Confere também que a chave viaja como *metadado*: o `PostId` chega à saga como value object, o payload do evento continua primitivo, e o carimbo (não-enumerável, sob um símbolo) não aparece no `toEqual` de um evento.
- `post-tags.resolver.spec` — o recorte em memória de `Post.tags`, que é a parte da connection que é lógica nossa.
- `find-author.query.spec` — o autor de um post, e **dois testes que não são sobre o resultado**: que resolver o autor de uma página de posts custa **zero consultas** (contadas no driver, com um controle que prova que o contador conta) e que o handler funciona **fora** de qualquer contexto de requisição, que é o caminho da subscription. Tirar o `'author'` do `populate` do repositório quebra o primeiro; tirar o `inRequestContext` do adapter quebra o segundo.
- `post-author.resolver.spec` — a troca do `authorId` pelo `Author`: o id vai na mensagem como value object, o agregado volta como `AuthorView`, e um autor que já não está lá é **erro** e não `null` — `Author!` não admite um campo não-nulo vazio.
- `user-view.mapper.spec` — o despacho polimórfico da borda, sem ORM nenhum no meio: quem decide a classe da view é `canWritePosts()`, que é `this is Author`. Um papel qualquer (ou papel nenhum) vira `ReaderView`; `author` vira `AuthorView`. E os três campos saem já normalizados pelo domínio, porque são os mesmos value objects.
- `user-query.resolver.spec` — `me` e o `__resolveType` juntos, que é onde a regressão moraria: o que o mapper escolheu é o que o `__resolveType` anuncia. Se os dois discordassem, um autor receberia `Reader` no `__typename` e o fragmento `... on Author` deixaria de casar — uma resposta válida e errada. Também que o nome devolvido é o do **schema** (`Author`), não o da classe (`AuthorView`): errar isso quebra em runtime, no graphql-js, e não na compilação.
- `author-posts.resolver.spec` — `Author.posts` isolado: o id do parent vira `FindPostsByAuthor` como value object, e **nenhum flag de `pageInfo` é conta do resolver** — eles vêm do `Cursor`, pelo `connectionOf`. Um autor sem posts é uma página vazia, e o mapper não é chamado.
- `find-posts-by-author.query.spec` — a connection de `Author.posts` contra o banco: a ordem decrescente (o contrário de `posts`), o recorte por autor (os posts de outro não entram nem no `totalCount`), um id desconhecido como página vazia em vez de erro — e que os posts voltam com `tags` e `author` **populados**, que é o contrato de que a borda depende e a razão de o método morar na porta e não no agregado.
- `validated-scalar.mixin.spec` — o value object escalar sozinho: normalização pelo schema, `toString`/`toJSON`/`valueOf`/hint numérico (inclusive `Date` → ISO, que o `JSON.stringify` não faria sozinho), igualdade por família, `parse` que não aplica um `transform` duas vezes, e as duas formas de especializar (`narrow` e sobrescrever `static schema`).
- `validated-dto-embedded.spec` — o value object **dentro** de um DTO: o construtor monta a classe, a serialização a colapsa, o `class-validator` continua reportando a mensagem do schema, e o `design:type` do campo passa a ser a classe (é o que um `@Field` sem thunk leria). Cobre opcional/nulo/default, listas, e o `Embeddable` de vários campos.
- `post-dto.spec` — a migração dos DTOs: por dentro os campos são os **mesmos** value objects do domínio; por fora sai exatamente o shape de antes, inclusive pelo caminho que o graphql-js percorre ao serializar um campo (`GraphQLID.serialize(view.id)`).
- `value-object-type.spec` — a ponte VO ↔ coluna, exercitada numa entidade de verdade num SQLite de verdade: hidrata como classe, guarda texto na coluna, aceita value object **e** texto na consulta, não gera UPDATE quando o valor não mudou, e o cursor de paginação vai e volta — inclusive um forjado, que precisa falhar.
- `user-soft-delete.spec` — a exclusão lógica contra o **banco**, e não contra objetos, como o `UserSoftDeleteJpaTest` de lá: `em.remove` marca em vez de remover, a linha da tabela filha da herança sobrevive, restaurar traz o `Author` inteiro, e o caminho do domínio (`softDelete` + `flush`) tem o mesmo efeito. Desligar o subscriber quebra três dos cinco.
- `soft-delete.spec` — o lado do domínio, sem ORM nenhum no meio: o value object (nasce vivo, e sabe se dizer) e o **mixin sozinho**, sem Post e sem User, como o `SoftDeletableTest` da versão Java — que é o que justifica ele ser um mixin: o comportamento é testado uma vez e as duas entidades herdam o teste junto com o código.
- `soft-delete-filter.spec` — o lado da infraestrutura: some das consultas sem sumir do banco, volta com `filters: { active: false }`, e **apagar o autor esconde os posts dele sem tocar nas linhas de post**.
- `subscription-bus.spec` — o `SubscriptionBus` num módulo Nest de verdade (`CqsrsModule.forRoot()`, explorer e tudo): roteia a mensagem para o seu `@SubscriptionHandler`, aplica o `filter` da mensagem dentro do stream, entrega **o mesmo `Observable`** para o mesmo critério (dois assinantes, uma inscrição no `EventBus`, o handler chamado uma vez só), separa critérios diferentes, desliga a fonte quando o último assinante sai e a religa sob demanda, e explode com `SubscriptionHandlerNotFoundException` quando ninguém trata a mensagem.
- `cqsrs.module.spec` — o módulo: `forRootAsync` nas quatro formas (`useValue`, `useFactory` com `inject`, `useClass`, `useExisting`), as opções chegando **nos dois lados** (o `subscriptionPublisher` no `SubscriptionBus`, o `eventPublisher` no `EventBus` — prova de que o resto é repassado ao `CqrsModule`), a factory de quem chama rodando **uma vez só**, e o `@SubscriptionHandler` registrado no bootstrap também pelo caminho assíncrono.
- `subscription-key.spec` — a chave: mesma coisa em qualquer ordem dá a mesma chave, `undefined` é o mesmo que ausente, `null` não é, arrays mantêm a ordem.
- `on-post-updated.subscription.spec` — o filtro por tópico como o que ele é: regra de aplicação, testada sem subir bus nenhum.
- `observable-to-async-iterable.spec` — o helper: entrega em ordem, `return()` cancela a inscrição **mesmo com um `next()` pendente**, erro propaga.
- `domain-exception.filter.spec` — a tabela exceção → `extensions.code`.
- `author.pipe.spec` / `session-user.pipe.spec` — a guarda da borda agora que ela é um pipe: o upcast deixa passar `Author` e recusa `Reader` nomeando o usuário; e a tradução da sessão aceita a entrada **ainda como Promise**, que é como o Nest a entrega ao primeiro pipe. O pipe entrega hoje um **id de credencial**, e não mais email/nome/papel copiados do cookie.
- `user-provisioning.hooks.spec` — a borda por onde o Better Auth chama para dentro: o id cru vira `CredentialId`, um id inválido não chega ao serviço, e uma falha ao provisionar **não** derruba o sign-up — o que é a regra que sustenta o desenho (autenticar é do provedor, provisionar é nosso).
- `mikro-orm-exception.filter.spec` — a outra tabela, a de violação de integridade → erro de usuário: FK vira `BAD_USER_INPUT` com mensagem **vaga** (distinguir "não existe" de "é leitor" seria um oráculo), unique vira `CONFLICT`, e nenhuma mensagem de driver vaza.
- `posts.e2e-spec` — o smoke test como teste: sobe o `AppModule` com SQLite em memória (`POSTS_DB` no `vitest.e2e.config.mts`), fala HTTP para queries/mutations e graphql-ws para subscriptions. Confere a ordem command → evento → entrega, a chegada da tag padrão por `onPostUpdated`, o filtro por tópico (o assinante filtrado vê só o seu post; o global vê tudo), os erros com código, as duas connections — que desassinar tira o assinante do `EventBus` na hora, contando os `observers` do `Subject`, e que **dois assinantes do mesmo tópico compartilham um stream só**: o `EventBus` não passa de um assinante, os dois recebem o mesmo payload, e a fonte só cai quando o segundo sai. E, pendurado no `EventBus`, que a `PostRequest` criada no resolver sobrevive ao caminho de verdade (Express → Apollo → `CommandBus` → saga): todos os eventos daquela mutation carregam o mesmo objeto. O `author` de toda selection deste ficheiro é o `type Author` (`author { id name email }`), subscriptions incluídas — então a resolução do campo está exercitada por todos os testes, e o bloco `Post.author` acrescenta o que só ela permite: navegar `post → author → posts → author` e fechar o ciclo, o autor de um post ser o **mesmo** que o `me` devolve, a resolução funcionar dentro da conexão WebSocket (sem o contexto aberto no adapter o cliente receberia `data: null`), e uma leitura anónima alcançar o autor. O bloco `me` é o polimorfismo ponta a ponta, com três clientes HTTP de verdade: o autor casa com `... on Author` e pagina os posts dele (Posts completos, `tags` aninhadas inclusive), um segundo cliente que fez sign-up **sem papel** vem como `Reader` e a resposta sai sem `posts` — não com `posts` vazio —, pedir `posts` num `Reader` é erro de schema, e um terceiro que nunca autenticou leva `UNAUTHENTICATED` do guard global, antes de o resolver existir.

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

**Uma classe por entidade, e o mapeamento do lado de fora.** `Post` é a entidade de domínio e o aggregate root do @nestjs/cqrs, numa classe só. O **mapeamento** não está mais junto: `PostSchema = defineEntity({ class: Post, … })` mora em `infrastructure/persistence/sqlite/entities/post-orm.entity`, com os outros `*-orm.entity`. Continua não existindo entidade espelho — o `defineEntity` aponta para *aquela* classe, e o que se separou foi a camada, não o objeto; o que o domínio ganhou é deixar de saber o tipo da coluna e o nome do índice. O único resquício do ORM que atravessa é herdar de `BaseEntity`, que é o preço de entrada do MikroORM. A base é `AggregateEntity = WithAggregateRoot(BaseEntity)`: a entidade já precisa herdar do `BaseEntity` do ORM, então `extends AggregateRoot` não serve — é exatamente o cenário para o qual o mixin existe. Uma constante compartilhada, e não um `WithAggregateRoot(...)` por entidade, porque o MikroORM descobre a classe-pai de cada entidade como entidade abstrata, e duas classes anônimas de nome `AggregateRoot` seriam ambíguas para ele. (Tentei antes `class Post extends WithAggregateRoot(PostSchema.class)` com `setClass`: a classe intermediária do mixin entra na cadeia de protótipos e a descoberta do ORM entra em loop — `Post extends AggregateRoot extends Post`.)

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

**Value objects como classes, e não como tipos.** `PostTitle`, `PostId`, `Email` e companhia são classes geradas por `ValidatedDto.Scalar(schema)` — o `@Embeddable record` do Java, com um schema Zod no lugar do construtor canônico. A regra continua num lugar só (o schema, dentro da classe); o que a classe acrescenta é o resto do que um value object é: `toString`/`toJSON`/`valueOf`/`Symbol.toPrimitive` (o value object *é* o valor onde um valor é esperado — inclusive para os scalars do graphql-js, que serializam chamando `valueOf`), `equals` por valor **e por família** (um `TagId` nunca é igual a um `PostId` de mesmo texto), `parse`/`safeParse`/`is`, e `narrow(t => t.max(40))` para especializar sem repetir a `brand`. Só o `parse` produz um a partir de texto de fora, então um `PostTitle` que existe continua sendo sempre válido. `Post.create` valida os dois de uma vez (`z.object({ title: PostTitle.field(), content: PostContent.field() })`, que já devolve os value objects prontos) e traduz o `ZodError` em `InvalidPostException` com `z.prettifyError`.

**E eles vão até a coluna.** `Post.id` é um `PostId` de verdade, chave primária inclusive. Quem faz a travessia é o `valueObjectType`: um `Type` do MikroORM gerado a partir da própria classe, que escreve o valor cru, hidrata a classe de volta, serializa o cursor de paginação como texto e o **valida** na volta (`fromJSON`) — um cursor forjado vira `CursorError`, e não um id impossível. O DDL não mudou uma linha (`varchar(36)`, `varchar(200)`, `text`), consultar aceita os dois lados (`em.findOne(Post, { id })` com o value object ou com o texto), e hidratar **não** revalida: é a mesma escolha de sempre, e é por isso que `PostId.wrap` existe ao lado de `PostId.parse`.

**O que os eventos carregam continua primitivo.** `PostCreatedEvent` guarda `string`, e não `PostTitle` — um evento é um fato que atravessa processo, e é isso que deixa a subscription `onPostUpdated` montar a `PostView` do payload sem tocar o banco dentro de um WebSocket. A conversão mora exatamente na fronteira que o `decidir → evoluir` já tinha: decidir escreve `title.value` no evento, evoluir faz `PostTitle.parse(event.title)` de volta — então a invariante roda também no replay. O `post-request.spec` trava os dois lados: o payload primitivo, e o `PostId` como value object viajando **por fora**, como metadado.

**Soft delete: um embeddable, um mixin, um filtro e um subscriber.** É a tradução peça a peça da versão Java, e as duas primeiras têm lá o mesmo nome. O **`SoftDeletion`** é o `@Embeddable`: o instante em que foi apagado (`null` = vivo), com `isDeleted`/`at()` e um `toString` que diz "vivo" ou "apagado em …". O **`WithSoftDelete`** é o `interface SoftDeletable` com métodos default: quem herda dá `identity()` e ganha o estado, as perguntas e **dois pares** de transição. `softDelete`/`restore` **decidem**: recusam quando não há fato novo (`AlreadyDeletedException`, `NotDeletedException`, as duas compartilhadas em `domain/shared`) — e são também o ponto de extensão, porque o agregado que precisa registrar o fato **sobrescreve** e chama `super` antes de disparar o evento, que é o que garante a guarda rodando antes de existir evento. (Em Java isso é uma sobrecarga; aqui é uma sobrescrita, mesma relação.) `applyDeletion`/`applyRestoration` **evoluem**: aplicam um fato já acontecido sem verificar nada. A distinção é a mesma de `decidir → evoluir` e não é estética: o mesmo `PostDeletedEvent` é aplicado duas vezes (ao decidir, e de novo ao reconstituir), e um handler `on<Evento>` que chamasse a versão que decide estouraria na segunda. E o **filtro `active`** é o `@SQLRestriction(ALIVE)`, dito com a ferramenta que o MikroORM recomenda para soft delete: viaja no `defineEntity` de cada agregado (do lado da infraestrutura, com o resto do mapeamento) com `default: true`, então toda consulta já nasce filtrada e quem precisar do apagado pede (`{ filters: { active: false } }`). Foi ele que deixou o repositório de User parar de repetir `deletedAt: null` à mão.

A tradução das anotações é peça a peça: `@SQLRestriction` vira o **filtro** e `@SQLDelete` vira o **subscriber** — as duas metades que o MikroORM oferece para soft delete, e uma sem a outra deixa um buraco, porque o filtro esconderia o que um `em.remove` teria apagado de verdade. O subscriber reclassifica o changeset de `DELETE` para `UPDATE` no `onFlush`, e a diferença em relação ao Java é a seu favor: lá o `Author` precisou de um `@SQLDelete` **próprio** porque numa herança `JOINED` o Hibernate emite um DELETE por tabela, e sem ele a linha de `authors` sumia de verdade enquanto a de `users` só era marcada — o autor voltaria de um restore como se fosse leitor. Aqui o changeset da entidade concreta carrega os das tabelas-pai (`tptChangeSets`), então reclassificar o de cima cobre a hierarquia inteira, e o mixin vale para qualquer entidade que o herde em vez de precisar de anotação por classe. O `user-soft-delete.spec` prova as duas coisas contra o banco, e desligar o subscriber quebra três dos cinco testes dele.

`PostRepository.restore(id)` e `UserRepository.restore(id)` existem como lá, e pelo mesmo desconforto: enquanto a linha está marcada, o filtro a esconde até do `findById`, então restaurar precisa de uma escrita que passe por fora (`nativeUpdate` com `active: false`). A razão exata difere — lá o que quebra é o SELECT que o `merge` do JPA faz por dentro; aqui o unit of work atualiza pela chave primária sem SELECT, então carregar com o filtro desligado e dar `flush` também funciona, e o `soft-delete.spec` cobre esse caminho.

Uma coisa diverge, e por diferença de linguagem: **o par que decide se chama `softDelete`/`restore`, e não `delete`/`restore`.** Em Java o agregado *sobrecarrega* aqueles nomes; aqui ele os **sobrescreve** e chama `super`, o que só funciona com uma assinatura só — daí o `softDelete`, que é como o resto do projeto já chamava a operação.

O `SoftDeletion` é **mutável**, como o de lá, e pelo mesmo motivo: é o pedaço de estado que o ORM gerencia e que as transições do mixin alteram — a mesma razão por que as entidades têm campos não-finais. A diferença é que a disciplina não é garantida: em Java a mutação fica trancada por visibilidade de pacote, e TypeScript não tem equivalente. O que existe é a convenção de que só `applyDeletion`/`applyRestoration` escrevem ali.

Uma armadilha do Java que aqui não existe, e o teste prova: o Hibernate deixa o `@Embedded` **nulo** quando todas as colunas dele vêm nulas — que é o caso de toda entidade viva —, e por isso o `Post.softDeletion()` de lá reinstancia o holder na leitura. Com `forceConstructor: true`, o MikroORM hidrata pelo `new` e o inicializador do campo roda antes de qualquer coluna ser atribuída. É a mesma flag que já estava lá por causa da `Collection` de tags.

O efeito que este README chamava de indireto passou a ser verdade junto: apagar um autor tira **os posts dele** das consultas sem tocar em nenhuma linha de post. Quem faz isso é o `autoJoinRefsForFilters` do MikroORM (ligado por padrão), que junta a relação m:1 quando ela tem filtro — e o `soft-delete.spec` confere exatamente isso, inclusive que a linha do post continua com `deleted_at` nulo.

**Só um Author escreve, e o upcast é um parâmetro.** `Post.create` recebe `Ref<Author>`, não `Ref<User>`: um Reader não é rejeitado por um `if`, ele simplesmente não cabe na assinatura. A triagem acontece **uma vez**, e nem sequer dentro do resolver: `@CurrentAuthor()` é o `@Session()` da lib de auth **composto com dois pipes** — `SessionUserPipe` (que tem o `UserProvisioning` injetado) traduz a sessão no perfil de domínio, e `AuthorPipe` faz o upcast com `canWritePosts(): this is Author`, recusando quem não escreve. O resolver não tem guarda escrita à mão, e também **não consegue esquecê-la**: o que ele declara é o tipo que ela produz.

É a composição do próprio Nest — um parâmetro aceita vários pipes, aplicados em ordem, e a saída de um alimenta o seguinte (`sessão → User → Author`). Um pipe, e não o corpo de um `createParamDecorator`, porque a factory de um param decorator recebe só o `ExecutionContext` e não participa da injeção de dependência: ela nunca alcançaria o `UserProvisioning`. Cada peça faz uma coisa e é testável sozinha — o que antes era um `requireAuthor` privado, testável só subindo um resolver, virou duas classes com spec próprio.

**O provedor de identidade entrou por uma porta.** O `UserProvisioning` não conhece o Better Auth: ele conhece o `IdentityProvider`, uma `abstract class` em `domain/user` com dois métodos — `findById(credentialId)` e `grantRole(credentialId, role)`. Quem sabe o nome do provedor é um adapter só, o `BetterAuthIdentityProvider`, e trocar o Better Auth por Keycloak (que é de onde este projeto veio) é escrever outro adapter e mudar uma linha do `IdentityModule`. Nada em `application/` muda — e o `user-provisioning.service.spec` inteiro roda contra um `FakeIdentityProvider` que cabe em 50 linhas, sem subir servidor de autenticação nenhum.

O adapter fala com o `internalAdapter` do `auth.$context`, e não com o `auth.api`. Não é conveniência: o `auth.api` é a superfície **HTTP**, e os endpoints de administração (`setRole`) exigem uma sessão de admin — aqui quem chama é o servidor, sobre si mesmo. O `internalAdapter` é a camada que aqueles endpoints usam por dentro, e tem a propriedade que decide a escolha: `updateUser` passa pelo `updateWithHooks`, então **conceder um papel dispara o hook de `user.update`**. O caminho da promoção é um só, venha ela da API ou de dentro.

**O que o provisionamento parou de perguntar: conta.** A versão Java tem um `Account` no domínio, com tabela própria, ligando credencial a perfil. Aqui não tem, e é de propósito: o Better Auth já faz isso — `account.accountLinking` prende a credencial nova do Google à identidade de quem já tinha senha, e o que chega à porta é **uma** identidade, com **um** email. Espelhar aquelas linhas criaria uma segunda verdade para manter em sincronia sem responder nada que o email já não respondesse; é o mesmo motivo pelo qual não existe um `PostEntity` ao lado do `Post`. A separação entre *user* e *account* continua existindo — ela mora inteira do lado de lá.

**Provisionar deixou de ser efeito colateral de uma query.** Enquanto o perfil nascia no `SessionUserPipe`, "existir no domínio" era consequência de ler um post: quem se registrasse e nunca fizesse uma query simplesmente não existia. Agora o gatilho é o fato: `@AfterCreate('user')` provisiona no sign-up, `@AfterUpdate('user')` promove quando o papel muda. São *database hooks* do Better Auth, descobertos pelo `@DatabaseHook()` do @thallesp/nestjs-better-auth, e moram em `interfaces/auth` porque são a mesma natureza de um resolver — algo de fora chamando a aplicação, só que com uma linha gravada no lugar de uma query.

Duas armadilhas, as duas custaram teste:

- o `setupDatabaseHooks` da lib começa com `if (!auth.options.databaseHooks) return`. Sem um `databaseHooks: {}` nas `authOptions`, os ganchos são registrados como providers, descobertos pelo `DiscoveryService`… e nunca chamados. É o pior modo de uma integração falhar, e por isso a linha tem um comentário do tamanho dela;
- um hook roda dentro da requisição de `/api/auth/*`, que já tem contexto do ORM — mas `grantRole` chama o Better Auth **de dentro do servidor**, sem requisição nenhuma, e `allowGlobalContext: false` recusaria a primeira consulta. `inRequestContext` reaproveita o contexto quando há um e abre um quando não há; é o que faz o hook enxergar o que a chamada que o disparou acabou de gravar.

O pipe continua chamando `provision` a cada requisição, e é de propósito que ele não sumiu: o método é idempotente (com o perfil já lá, provisionar é uma leitura), e ele é a **retaguarda** para uma identidade que tenha nascido por um caminho que não passou pelo hook. Falhar ao provisionar não derruba o sign-up — autenticar é do provedor, provisionar é nosso, e a requisição seguinte refaz o trabalho.

O e2e é onde isso vira verificação: ele mede quantos perfis existem **entre** o sign-up e a concessão do papel (um, criado pelo hook, antes de qualquer query), e promove chamando `identities.grantRole(...)`. Antes essa linha era um `nativeUpdate` na tabela `authUser` — que atalhava o Better Auth inteiro e portanto não exercitava hook nenhum.

**Uma pegadinha que só o e2e pega.** A factory do `@Session()` é `async`, e o Nest **não a resolve antes de aplicar os pipes**: no `ExternalContextCreator`, `const value = extractValue(...)` não é awaited, e o `await` que existe só resolve a Promise quando **não** há pipe. Com pipe, quem recebe a Promise é o primeiro da cadeia — daí o `await` no `SessionUserPipe`. Do segundo em diante o `PipesConsumer` já resolve entre um e outro. Há um teste para isso, mas foi o e2e que o encontrou.

**E por isso o command handler não relê o autor.** Quando o `authorId` chega lá, ele já passou por todo o processo de saber que é de um autor; o que falta é só a referência que a coluna guarda, e `ref(rel(Author, id))` a produz sem consulta nenhuma. O handler perdeu o `UserRepository` inteiro. Quem garante que aquele id existe **e é de um autor** é a chave estrangeira `posts.author_id → authors.id` — que com a herança multi-tabela não aceita um Reader nem por acidente de dados, e que garante **melhor** do que a consulta garantia: um SELECT antes do INSERT tem uma janela em que o autor pode sumir, e a restrição não tem.

A checagem que saiu tinha ainda um segundo defeito, e é o que decide a questão: ela distinguia "não existe" de "é leitor", e isso é um **oráculo de quais usuários existem**. A FK não distingue, e a mensagem traduzida também não — `NotAnAuthorException` sem id diz apenas "o autor informado não existe ou não pode escrever". A versão com id existe e é usada só na borda, onde quem recebe a mensagem é o próprio dono da sessão.

**Confiar na restrição exige traduzi-la.** Sem tradução, uma FK recusada chegaria ao cliente como `INTERNAL_SERVER_ERROR` com uma mensagem de driver, e ninguém trocaria uma checagem legível por isso. O `MikroOrmExceptionFilter` faz a ponte — FK → `BAD_USER_INPUT` com a mensagem vaga, unique → `CONFLICT`, `NotFoundError` → `NOT_FOUND`, e o resto sobe como está, porque um erro de driver que ele não reconhece é bug ou indisponibilidade e mascará-lo seria pior. Ele é aplicado com `@UseFilters` **no resolver que escreve**, e não globalmente: é lá que uma violação de integridade é uma resposta possível ao que o cliente pediu.

O que o command carrega, então, é o **retrato** do autor: o id, que vira a referência, e o nome, que é o que o `PostCreatedEvent` registra para a subscription montar a `PostView` sem tocar o banco. (Na versão Java o evento não leva o nome — lá o `Post.author` do GraphQL é resolvido por DataLoader. É a única coisa que ainda mantém um campo a mais no command deste lado.)

**Relacionamento é relacionamento, e não um id solto.** `supersededBy` e `supersedes` guardavam um `UserId`; agora são `Ref<User>` — auto-referência para a **raiz abstrata** da herança, então o ORM resolve `Reader` ou `Author` ao carregar. A coluna não mudou (`fieldName` a manteve como `superseded_by`), mas o banco ganhou o que faltava: `constraint users_superseded_by_foreign` e um índice. Antes, nada impedia um stream apontar para um sucessor inexistente.

Isso cobrou duas coisas, e as duas apareceram como teste vermelho antes de aparecerem como decisão. A primeira: `rel()` monta a referência pelo `EntityFactory`, então **o User passou a precisar da metadata do ORM** para evoluir os próprios eventos — o `user.entity.spec` agora inicializa um MikroORM só para descoberta, exatamente como o `post.entity.spec` já fazia por causa da `Collection` de tags. É o preço de preferir relacionamento a id, e ele é este.

A segunda foi um **bug latente que a chave estrangeira revelou**: a promoção gravava o stream encerrado (`superseded_by` → o novo autor) *antes* de o autor existir. Com um `UserId` solto ninguém reclamava; com a FK, recusa na hora. A correção não é inverter a ordem — isso trocaria um estado inconsistente por outro, com o autor criado e o leitor ainda ativo. É **uma transação só**: `UserRepository.saveAll([author, reader])`, e o unit of work ordena o insert antes do update. Não existe mais instante em que o banco esteja inconsistente — o que, de quebra, torna impossível o "stream órfão" que o `pendingPromotionId` existe para recuperar.

**`Reader` e `Author` em arquivos próprios — e a fábrica num terceiro.** Na versão Java `User.register(...)` mora na raiz e a lista de tipos é uma anotação nela (`concreteTypes = {Reader.class, Author.class}`): a raiz cita os filhos, os filhos estendem a raiz, e o compilador resolve o mútuo. Em TypeScript isso é um **ciclo de módulo com efeito real** — `class Author extends User` precisa do `User` já avaliado, então quem carregasse `user.entity` primeiro veria `extends undefined`. Tentei auto-registro (cada subclasse se anunciando ao carregar) e o teste mostrou o defeito imediatamente: um spec que importava só `user.entity` e `author.entity` construía users sem o tipo de fallback — e a falha é silenciosa, um author nasceria leitor. A saída é `user.factory`: **um módulo que conhece os três**. O grafo fica de mão única, e importar `Users` traz a hierarquia inteira; não há como pedir metade dela.

**`Author.posts`, e o convite que ela não aceita.** O `Author` da versão Java deliberadamente **não** tem esta coleção, e o javadoc diz por quê: "um autor produtivo tem milhares de posts, e uma coleção mapeada é um convite a carregar todos para responder qualquer coisa". O convite é real. A resposta aqui não foi abrir mão da coleção — foi não expor o que o aceita: não há `loadItems()` na classe, e os dois métodos que ela oferece vão ao banco com `limit`/`count`. `posted({ limit, offset })` usa o `matching()` da própria coleção, e `postCount()` é um `count(*)`. O `author.entity.spec` afirma isso diretamente: depois de paginar e de contar, `posts.isInitialized()` continua `false`.

**Tags como relação de verdade — e o que isso custou.** `Post.tags` é `Collection<Tag>`, um many-to-many com pivô `posts_tags`: o Post guarda o **agregado `Tag`**, não uma cópia de id + nome. A versão anterior usava um embeddable (`p.embedded(TagRef).array()`, uma coluna JSON na própria linha) pelo argumento clássico de DDD — agregado referencia agregado por identidade, e uma relação do ORM entre os dois abre cascatas e lazy loading atravessando a fronteira de consistência. A troca vale a pena por integridade referencial, por um rename de tag passar a aparecer nos posts, e por dar acesso ao `populate`/`dataloader` do ORM; e cobra três coisas que vale registrar.

**Primeiro: o ganho de dataloading é parcialmente circular.** Com as tags na linha não havia N+1 nenhum — N posts eram N linhas com as tags dentro. A relação *cria* o N+1 que o dataloader depois resolve. Na prática o caminho do GraphQL nem chega lá: o `MikroOrmPostRepository` popula (`populate: ['tags']`) no `findById` e no `findByCursor`, o que resolve tudo em uma consulta a mais. O `dataloader: DataloaderType.ALL` no config cobre o acesso preguiçoso que aparecer.

**Segundo: `decidir → evoluir` entra em atrito com a relação.** O evento carrega primitivos (`{ tagId, name }`) — isso não mudou, e é o que deixa a subscription `onPostUpdated` montar a `PostView` do payload sem tocar o banco dentro de um WebSocket. Mas de primitivos não se materializa um agregado: o evento devolve **ids**, e o `Tag` como objeto só existe se alguém o trouxe. Por isso `assignTag` põe a Tag na coleção **antes** de levantar o evento, e `onPostUpdatedEvent` remonta a lista reaproveitando o que a coleção já tem (`rel()` cobre só o que faltar). O evento continua mandando na participação — quem não estiver nele sai; os objetos apenas sobrevivem à travessia.

A saída que *parece* óbvia não funciona, e vale saber por quê: confiar no identity map. `EntityFactory.createReference` de fato consulta `unitOfWork.getById(...)` antes de fabricar um stub, mas aquele `unitOfWork` não é o da request — `rel()` chega ao factory por `entityType.prototype.__factory`, e o `EntityHelper.decorate` o prende, **uma vez, na descoberta**, a um `em.fork()` dedicado guardado como campo privado. Medido: dentro do mesmo fork que acabou de carregar a Tag, `em.getReference(Tag, id).name` é `'Untagged'` e `rel(Tag, id).name` é `undefined`. Um eager load no command não muda isso. O que resta como limitação é o replay puro (`loadFromHistory` num Post novo): os ids voltam, os nomes não — reidratá-los exige um EntityManager, que o domínio não tem.

**Terceiro: o domínio deixou de rodar sem o ORM.** Uma `Collection` descobre a que propriedade pertence lendo a metadata do dono (`Collection.property` → `wrap(owner).__meta`), então qualquer `add`/`set` numa entidade não descoberta estoura `MetadataError`. O `post.entity.spec` passou a inicializar um MikroORM só para a descoberta — sem `ensureDatabase`, sem tabela, sem leitura. Não há como evitar: `propagationOnPrototype: false` não serve, porque a flag é lida do config de um ORM **já inicializado** (`EntityHelper`) e não passa perto desse getter.

O `Post.tags(first, after)` do schema não mudou: o `PostViewMapper` achata a coleção populada para a `PostView`, e o `PostTagsResolver` continua recortando em memória. O schema é byte a byte o mesmo.

**Cursor connection montada pelo ORM.** `posts(first, after)` é `em.findByCursor(Post, { first, after, orderBy: { createdAt: 'asc', id: 'asc' } })`. O `Cursor` devolvido já traz `items`, `hasNextPage`, `startCursor`/`endCursor` e `from(entidade)` para o cursor de cada edge; o resolver só monta o shape. A ordenação é `createdAt, id` porque `createdAt` sozinho não é único. Os tipos `PostConnection`/`PostEdge`/`PageInfo` estão escritos no schema; do lado do TypeScript sobra `ConnectionType<T>`, um tipo genérico sem comportamento. As tags usam `Cursor.encode`/`Cursor.decode` do próprio MikroORM para os cursores, então as duas connections falam o mesmo dialeto.

**`me` devolve uma interface, e o casting é do tipo — não de uma claim.** `me: User!` é a única query polimórfica do schema, e a cadeia que a sustenta não tem um `if` de autorização em lugar nenhum: o `UserProvisioning` devolve o perfil que o ORM hidratou (`Reader` ou `Author`, decidido por existir linha em `authors`), o `UserViewMapper` despacha por `canWritePosts()` — que é `this is Author` —, e o `__resolveType` traduz a classe do DTO no nome do schema. O efeito é que `... on Author { posts }` **não casa** para um leitor, e a resposta sai sem o campo em vez de sair com uma lista vazia. O papel no cookie continua existindo e continua barrando cedo (`@Roles([AUTHOR_ROLE])` nas mutations), mas o que *aparece* numa resposta vem da hierarquia real: não há flag a forjar.

**`Post.author` é um `Author`, e isso tornou o schema um grafo.** Era `author: String!` — o nome copiado para a `PostView` —, e um nome não é navegável: o protocolo parava ali. Agora a view carrega `authorId` e o campo é resolvido à parte, então `post → author → posts → author` fecha o ciclo. O `!` não é otimismo: a coluna `posts.author_id` aponta para `authors`, então a chave estrangeira já garante que o autor de um post nunca é um `Reader` — e é por isso que o `UserViewMapper` ganhou um `fromAuthor` tipado em vez de o resolver fazer um cast.

A troca tem um custo, e ele não é o mesmo nos dois caminhos. Nas **leituras** é zero: o repositório já populava o autor junto do post, então ele está no identity map da requisição e a resolução não emite consulta — medido no driver, com um controle, no `find-author.query.spec`. Nas **subscriptions** é uma consulta por payload entregue, e isso é a parte interessante: a view de `onPostCreated` nasce do payload do evento justamente para não tocar o banco, e o evento carrega `authorId` **e** `authorName`, mas não e-mail — porque o e-mail de alguém não é um fato sobre um post. Quem pede `author` numa subscription está pedindo algo que não está no evento, e paga por isso; quem pede só `id title version` continua sem tocar o banco.

Isso trouxe um segundo efeito, que é o que faltava descobrir: a resolução de um campo disparado por subscription roda **fora** do middleware do Express, dentro do WebSocket, e portanto sem contexto do ORM — `allowGlobalContext: false` recusava a consulta e o cliente recebia `data: null`. A correção é o `inRequestContext` nas duas leituras que um resolver de campo alcança (`UserRepository.findById` e `PostRepository.findByAuthor`): havendo contexto, o envelope é inerte e o identity map continua o da requisição; não havendo, abre-se um. Qualquer leitura nova alcançável por um campo precisa do mesmo envelope — são duas hoje, e está dito nos dois lugares.

Uma consequência que ficou por decidir: o `authorName` dos eventos já **não é lido por ninguém**. Ele continua no payload porque um fato gravado não se reescreve por ter deixado de ser consultado, e porque é o que permitiria um dia dizer "o nome na época" — que é precisamente o que um `authorId` sozinho não diz. Tirá-lo é uma decisão à parte, e está anotada como tal no `Post.create`.

**`Author.posts` é uma consulta, não uma coleção.** O agregado tem `posted()`/`postCount()` e eles seguem sendo a resposta para perguntas de domínio — mas o campo do schema passa pela porta (`PostRepository.findByAuthor`) por uma razão específica: `populate` é preço da referência sobre a cópia, e esse preço é cobrado na borda da persistência, não no domínio. Um `Author.posted()` que soubesse que a `PostView` quer `tags` teria virado read model. De quebra, os dois lados ganham o mesmo keyset do `em.findByCursor` — a ordem é que difere (`Query.posts` é crescente por criação, `Author.posts` decrescente). As duas ordenam pelas mesmas chaves, então um cursor de uma lista **decodifica** na outra sem ser recusado: ele passa a significar o lado oposto da comparação, e a página que sai é outra (normalmente vazia). Não é um problema a resolver — um cursor é opaco por contrato, e quem o tira de uma lista o devolve na mesma —, mas é a razão de não existir atalho entre as duas: são listas diferentes, não duas vistas da mesma.

**O `pageInfo` nunca é recalculado por um resolver.** Com duas connections servidas por cursor, a conta de `hasNextPage` existiria em dois lugares — e uma paginação que mente é um bug que não aparece em nenhum teste de campo. O `connectionOf` é a única peça que lê o `Cursor` do MikroORM, e o que sobra para quem chama é só o que é dele: como um item vira nó do protocolo. É o `Connections` da versão Java, pelo mesmo motivo.

**Portas como classes abstratas.** `PostRepository` e `TagRepository` são `abstract class`, não `interface`: no Nest a classe é ao mesmo tempo o contrato e o token de injeção (`{ provide: PostRepository, useClass: MikroOrmPostRepository }`), sem `@Inject('TOKEN')`.

**Uma altura de validação — mesmo com value objects na borda.** A versão Java validava na borda (Bean Validation) e no domínio. Aqui só o domínio valida, e isso não mudou quando `CreatePostInput` passou a declarar `title: PostTitle`: o construtor de um value object gerado **não lança** — ele normaliza pelo schema e, se o valor for inválido, guarda o valor cru para quem quiser perguntar (`isValid()`, ou o `class-validator`). Um título em branco continua atravessando a borda e sendo rejeitado pelo domínio, e o `DomainExceptionFilter` o entrega ao cliente como `BAD_USER_INPUT` com a mensagem do value object. A única exceção continua sendo a mesma de antes, agora escrita como `id.assertValid()` no `PostInputMapper` — um id que não é UUID nem vira command.

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
- **O N+1 de `Author.posts`**, que `Post.author` abriu: `posts(first: 20) { author { posts { … } } }` chega ao `AuthorPostsResolver` vinte vezes, e cada vez é uma consulta paginada. (`posts { author { … } }` sem descer não é N+1 — o populate do repositório o cobre, e há teste.) A saída nativa é o `dataloader: DataloaderType.ALL`, já ligado no config, passando a valer para este campo — o que pede a página pela **relação** do agregado (`Author.posted`, que o dataloader agrupa) em vez de uma consulta por autor. O que hoje impede é o `populate`, que o `Author.posted` não declara: ver `PostRepository.findByAuthor`.
- **Tirar o `authorName` dos eventos**, ou assumi-lo como projeção: hoje ninguém o lê. A pergunta que a decisão faz é se este sistema quer poder dizer "o nome do autor na época", que é o que um `authorId` sozinho não diz.
- `deleteMe` / `restorePost` / `deletePost`: as mutations de exclusão lógica que a versão Axon expõe. O domínio já as tem inteiras (`softDelete`/`restore` no mixin, e `PostRepository.restore`/`UserRepository.restore` para a linha reaparecer); falta o `@Mutation`.
- `bio` no `Author` — a única diferença de campo entre o `type Author` de lá e o daqui.
