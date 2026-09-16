# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (pinned: `pnpm@10.28.0`).

```bash
pnpm install
pnpm start:dev                 # http://localhost:3000/graphql (GraphiQL + graphql-ws no mesmo endereço)
pnpm build                     # nest build (copia src/graphql/**/*.graphql para dist/ como asset)
pnpm typecheck                 # tsc --noEmit — é o único gate estático (não há ESLint nem Prettier no projeto)

pnpm test                      # unitários: src/**/*.spec.ts
pnpm test:e2e                  # aplicação inteira por HTTP + WebSocket: test/**/*.e2e-spec.ts
pnpm test:all                  # os dois
pnpm test:cov:all              # cobertura somada dos dois runners (--merge-reports)
```

Um arquivo ou um teste só:

```bash
pnpm vitest run src/application/post/command/create-post.command.spec.ts
pnpm vitest run src/domain/post/post.entity.spec.ts -t "applying the same event twice"
pnpm vitest run --config vitest.e2e.config.mts -t "onPostUpdated"
```

Variáveis de ambiente: `POSTS_DB` (default `data/posts.db`; os e2e usam `:memory:`), `MIKRO_ORM_DEBUG=true` (SQL no log), `PORT`, `AUTH_URL`, `AUTH_SECRET`.

## Idioma

README, comentários de código e mensagens de exceção estão em **português**. Código novo deve seguir: identificadores em inglês, prosa em português. O `README.md` é a documentação de desenho do projeto (longa e detalhada) — vale consultá-lo antes de mudar qualquer decisão estrutural.

## Arquitetura

POC DDD/CQRS: NestJS 12 + `@nestjs/cqrs` 12 + MikroORM 7 (SQLite) + `@nestjs/graphql` 14 (Apollo, **schema-first**). Reescrita em TypeScript do `axon-graphql-posts` (Axon 5 + Spring GraphQL) — o README traz a tabela de tradução Axon → Nest, útil quando uma escolha parecer arbitrária.

### A cadeia de módulos é a fronteira das camadas

```
InterfacesModule (src/interfaces)  →  ApplicationModule (src/application)  →  PersistenceModule + IdentityModule (src/infrastructure)
```

Cada módulo importa **só** o de baixo, e o `AppModule` lista apenas o `InterfacesModule` — os outros entram por transitividade, de propósito. Um resolver não consegue injetar `PostRepository`: as portas só saem do `PersistenceModule`. Peças de framework (`CqsrsModule.forRoot()`, `MikroOrmModule`, `AuthModule`, `GraphQLModule`, `AutomapperModule`) ficam todas no `app.module.ts` e são globais.

### CQSRS: a terceira mensagem (`src/cqsrs`)

Mini-biblioteca própria, que não sabe o que é GraphQL, acrescentando ao CQRS do Nest um bus para subscriptions:

| | mensagem | decorator | método | bus | resultado |
|---|---|---|---|---|---|
| command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
| query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
| subscription | `Subscription<TEvent, TCriteria>` | `@SubscriptionHandler` | `subscribe` | `SubscriptionBus` | `Observable<TEvent>` |

- **O `EventBus` do `@nestjs/cqrs` é o emitter das subscriptions** — ele é um `Observable`/`Subject`, e um handler devolve `eventBus.pipe(ofType(Evento))`. Não existe `PubSub` do `graphql-subscriptions`, nem `Subject` paralelo.
- **O filtro é da mensagem, e o filtro é a chave.** `Subscription.match(event)` mora na classe da mensagem (camada de aplicação), e `Subscription.key` (`nome(critério)`) é o que faz dois assinantes do mesmo critério compartilharem **um** stream e **uma** inscrição no `EventBus`. (O README chama esse método de `filter`; no código ele é `match()`.)
- `subscribeAsAsyncIterable(bus, sub)` é a cola push→pull; ela resolve `next()` pendentes com `done: true` na hora, o que um `async function*` não faz — mexer nela reabre um vazamento de assinante por cliente que desconecta.

### Fatia = um arquivo, com a mensagem e o handler dentro de um `namespace`

`CreatePostCommand.CreatePost` + `CreatePostCommand.Handler` vivem em `create-post.command.ts`, com o `.spec.ts` ao lado. Idem para `*.query.ts`, `*.subscription.ts`, `*.saga.ts`. **Todo handler novo precisa ser registrado em `src/application/application.module.ts`** (os explorers varrem o `ModulesContainer`, não o disco).

### `PostRequest`: a request atravessa a cadeia inteira

A borda cria `new PostRequest(postId)` e passa em `commandBus.execute(command, request)`. Os command handlers são `{ scope: Scope.REQUEST }` + `@Inject(REQUEST)`, e carimbam os eventos com `publisher.mergeObjectContext(post, this.request)`. A saga lê de volta com `PostRequest.of(event)` e repassa com `request.attachTo(command)`. Um `execute` sem esse contexto compila, passa no caminho feliz e quebra a saga — por isso há testes só para isso (`post-request.spec.ts`).

### Domínio decide e evolui; aplicação orquestra

Entidades estendem `WithAggregateRoot(WithSoftDelete(BaseEntity))`: métodos de decisão (`create`/`update`/`assignTag`) chamam `this.apply(evento)`, que despacha para os `on<Evento>` — que devem ser **idempotentes**, porque são o replay (`loadFromHistory`). O command handler carrega pelo repositório, decide pelo domínio, `save()` e **só então** `commit()`. Saga não grava: despacha commands.

### Persistência: o domínio não tem um decorator de ORM

O mapeamento fica em `src/infrastructure/persistence/sqlite/entities/*-orm.entity.ts`, via `defineEntity({ class: Post, ... })`. Os value objects viram coluna por `valueObjectType(PostId, { columnType })`. Soft delete são quatro peças: `SoftDeletion` (embeddable) + `WithSoftDelete` (mixin de domínio) + filtro `active` (ligado por padrão) + `SoftDeleteSubscriber` (troca `DELETE` por `UPDATE deleted_at`).

As portas são **classes abstratas** em `src/domain/*/*.repository.ts` (servem de token de DI) e os adapters são ligados em `persistence.module.ts`. Caminhos que não nascem de uma requisição HTTP — resolver de campo dentro de uma subscription (WebSocket), hooks do Better Auth, testes — precisam de `inRequestContext(em, work)` (`src/infrastructure/persistence/request-context.ts`), senão a primeira consulta é recusada.

### Borda GraphQL

- **Schema-first**: o SDL em `src/graphql/*.graphql` é a fonte; os resolvers se ligam por nome (`@Resolver('Post')`, `@Query('posts')`, `@ResolveField('tags')`). Nenhum DTO carrega decorator de GraphQL. Campo novo = arquivo `.graphql` + resolver + registro no `interfaces.module.ts`.
- **DTOs e VOs vêm de schemas Zod**: `ValidatedDto(schema)` + `@InheritValidatedMetadata()` para objetos, `ValidatedDto.Scalar(schema)` para value objects de um valor, `.Embeddable` para vários. `VO.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] })` é como um VO entra num shape de DTO já decorado.
- **Nenhum resolver chama o mapper** (exceto `createPost`, que precisa do autor da sessão via `extraArgs`). A saída sai por interceptor: `MapInterceptor`, `ConnectionInterceptor(Post, PostView)`, `MapSubscriptionInterceptor(Evento, View)`, `UserViewInterceptor` (o despacho polimórfico de `me`). A entrada entra por `MapPipe`. Todo mapeamento é declarado nos perfis do AutoMapper em `src/interfaces/mapper/`, com `valueObjectConverter(PostTitle, String)` por perfil para a travessia dos VOs.
- **Auth**: só `src/infrastructure/auth` conhece o Better Auth; o resto fala com a porta `IdentityProvider`. O guard global exige sessão — as leituras de post optam por fora com `@AllowAnonymous()`; escrita usa `@Roles([AUTHOR_ROLE])` + `@CurrentAuthor()` (que é `@Session()` + `SessionUserPipe` + `AuthorPipe`).
- **Erros**: `DomainExceptionFilter` (APP_FILTER) traduz exceção de domínio → `GraphQLError` com `extensions.code`; `MikroOrmExceptionFilter` (nos resolvers de mutation) traduz violação de integridade → `BAD_USER_INPUT`/`CONFLICT` sem vazar mensagem de driver.

## Testes

Não há repositório fake: os specs de handler montam o `CqsrsModule` de verdade e um SQLite **em memória** por `createCqrsTestingModule([...])` (`test/support/cqrs-testing-module.ts`), registrando **só o handler sob teste** — dependência acidental entre handlers quebra o teste. O banco prova o que foi salvo; `RecordingEvents` (pendurado no `EventBus`) prova o que foi publicado. Como os handlers são request-scoped, o teste despacha pelo `CommandBus` com uma `PostRequest` — não existe "a" instância de um handler para pegar do módulo.

Cobertura exclui `index.ts`, `interfaces/`, `*.interface.ts`, `main.ts` e o config do ORM; resolvers, mappers e DTOs contam.

## Pegadinhas

- **`fieldResolverEnhancers: ['interceptors']` no `GraphQLModule` não é opcional.** Sem isso os `@ResolveField` devolvem o agregado cru e o sintoma é um `Cannot return null for non-nullable field ...` que não aponta para lugar nenhum.
- **MikroORM 7 e AutoMapper 9 são ESM-only**; a app roda em CommonJS pelo `require(esm)` do Node 22. Jest não faz isso — daí **Vitest + `unplugin-swc`** (o esbuild do Vite não emite `emitDecoratorMetadata`, que a DI do Nest precisa). Os decorators do ORM (`@CreateRequestContext`, `@Transactional`) vêm de `@mikro-orm/decorators/legacy`.
- **TypeScript está pinado em `^6`**: o 7 não expõe a API programática que o Nest CLI usa. `tsconfig.build.json` precisa do `rootDir` explícito.
- Os `.graphql` são **assets** copiados pelo `nest-cli.json`; o `typePaths` usa `__dirname` (logo `src/` sob Vitest, `dist/` em produção).
- `@automapper/nestjs` 9 declara peer de `@nestjs/*` 10/11 e o projeto está no 12 — o aviso do pnpm é esperado.
