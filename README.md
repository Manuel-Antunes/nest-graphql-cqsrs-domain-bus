# nest-graphql-posts

POC: **monorepo NestJS 12** com **dois serviços**, **@nestjs/cqrs 12**, **MikroORM 7** e **@nestjs/graphql 14 (Apollo)**. Subscriptions GraphQL alimentadas **pelo próprio `EventBus` do CQRS** — e, quando o fato acontece no outro serviço, por **Redis pub/sub**. Começou como a reescrita em TypeScript do [axon-graphql-posts](https://github.com/Manuel-Antunes/axon-graphql-posts) (Axon Framework 5 + Reactor + Spring GraphQL), e foi além em duas direções: o **CQSRS** (a subscription como terceira mensagem, com bus próprio) e uma **saga coreografada entre dois processos**.

| | |
|---|---|
| **`apps/api`** | HTTP + GraphQL (Apollo) — posts, tags e os pedidos. Sobe **híbrida**: também escuta uma fila RabbitMQ |
| **`apps/payments`** | microserviço puro — sem HTTP, só a fila `order.payments` |
| **`libs/cqsrs`** | Command/Query/**Subscription** Responsibility Segregation: o bus da terceira mensagem |
| **`libs/order`** | o domínio do pedido e **a saga que os dois serviços compartilham** |
| **`libs/messaging`** | eventos por Redis (fan-out), commands por RabbitMQ (fila) |

A ideia central: o `EventBus` do @nestjs/cqrs **é um `Observable`** do RxJS (um `Subject` por baixo) — o mesmo objeto em que os event handlers e as sagas se inscrevem. Uma subscription GraphQL é, no fundo, "devolva um async iterator". Então basta ligar um ao outro.

Em cima disso, o projeto acrescenta a peça que o @nestjs/cqrs não tem: **CQSRS — Command, Query, *Subscription* Responsibility Segregation** (`src/cqsrs`). Um bus próprio para a terceira mensagem, com `subscribe` no lugar de `execute`:

| | mensagem | decorator | handler | bus | resultado |
|---|---|---|---|---|---|
| command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
| query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
| **subscription** | **`ISubscription<TEvent>`** (+ o helper `Subscription<TEvent, TCriteria>`) | **`@SubscriptionHandler`** | **`subscribe`** | **`SubscriptionBus`** | **`Observable<TEvent>`** |

E o filtro é da mensagem, não do transporte: toda `Subscription` tem um método `filter(event)`, e o critério que ele lê (`{ postId }`) **é também a chave** pela qual o bus acha o stream — dois assinantes de `onPostUpdated(postId: X)` recebem o mesmo `Observable` e custam **uma** inscrição no `EventBus`.

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
                  EventBus (Subject do RxJS) ── ofType(PostCreatedEvent) ──┬─► OnPostCreatedSubscriptionHandler.subscribe()
                     │                                                    │      └─► PostView do payload ──► onPostCreated
                     │                                                    └─► AssignDefaultTagOnPostCreated (@Saga)
                     │                                                           ├─► tag "Untagged" no banco? não ──► CommandBus.execute(CreateTagCommand)
                     │                                                           └─► emite AssignTagToPostCommand ──► EventBus o executa
                     │                                                                    └─► Post.assignTag(...) ──► PostUpdatedEvent (com a tag)
                     └── ofType(PostUpdatedEvent) ──► OnPostUpdatedSubscriptionHandler.subscribe()
                                                                    │
                                                                    ▼
                  SubscriptionBus: filter(event) da própria mensagem + share por chave (id + critério)
                                   um stream por critério; desliga quando o último assinante sai
                                                                    │
                                                                    ▼
                  PostSubscriptionResolver: subscribeAsAsyncIterable(bus, new OnPostUpdatedSubscription({ postId }),
                                                                     evento => PostView)  ──► @Subscription({ resolve })
                                                                    │
                                                                    ▼
                  Apollo ──► graphql-ws (WebSocket em /graphql) ──► { "data": { "onPostUpdated": { ... } } }
```

## O fluxo do pedido: dois serviços, uma saga, nenhum orquestrador

```
 cliente gera a chave (UUID) e ASSINA ANTES de mandar qualquer coisa
   │
   ├── subscription onOrderUpdated(key) ─────────────────────────────────────┐
   │                                                                        │
   └── mutation placeOrder(key, amount) ──────► PlaceOrderCommand             │
                                                │  (idempotente pela chave)  │
        ┌─────────────────── apps/api ──────────┼────────────────────────┐   │
        │                                       ▼                        │   │
        │                          Order.place() ──► OrderPlaced ───────┼───┤ (local)
        │                                       │                        │   │
        │             EventBus ──► OrderSaga ─────► EnqueueCommand       │   │
        └───────────────────────────────────────┼────────────────────────┘   │
                                       RabbitMQ │ payment.authorize          │
        ┌──────────────── apps/payments ────────▼────────────────────────┐   │
        │  Payment.authorize() ──► PaymentAuthorized ──► OrderSaga       │   │
        │        │           @TransportType(REDIS) └──► Redis ───────────────►┤ (remoto)
        │        └──► RabbitMQ payment.capture ──► PaymentCaptured        │   │
        │             @TransportType(REDIS, RMQ) ├──► Redis ────────────────►─┤ (remoto)
        │                                        └──► RMQ ──► PaymentLedger│   │
        │                                 └──► RabbitMQ order.complete    │   │
        └───────────────────────────────────────┼────────────────────────┘   │
        ┌─────────────────── apps/api ──────────▼────────────────────────┐   │
        │    Order.complete() ──► OrderCompleted ────────────────────────┼───┤ (local)
        └────────────────────────────────────────────────────────────────┘   ▼
                                                        o assinante viu os 4 passos
```

Três ideias sustentam isso, e cada uma resolve um problema concreto.

### 1. A chave é do cliente — e faz três trabalhos

O frontend (ou o teste) gera um UUID e o manda nas **duas** pontas: na mutation e na subscription. Com isso ele:

- **deduplica** o pedido: a chave é a identidade do agregado, então o clique duplo devolve o mesmo pedido e não dispara evento nenhum. A idempotência não é um `if` no handler, é uma consequência do modelo;
- **assina antes de começar**: como ele já conhece a chave, não existe a janela entre "o servidor me deu um id" e "eu consegui escutar" — a corrida que um id gerado no servidor cria;
- **correlaciona**: todo evento dos dois serviços carrega a chave, e é por ela que a subscription reconhece "os eventos deste pedido".

E como o critério de uma subscription CQSRS **é** a sua chave de compartilhamento, duas abas do mesmo pedido custam um stream só.

### 2. Cada evento escolhe os seus transportes

O `EventBus` do @nestjs/cqrs delega o *publicar* a um `IEventPublisher`. O `TransportEventBus` troca esse publisher por um que faz o `subject$.next` de sempre **e** difunde o evento pelos transportes que a **classe dele** declarou. Quem escuta — sagas, event handlers, subscriptions — continua escutando o mesmo `Subject`.

```ts
@TransportType(Transport.REDIS)                     // um aviso: quem estiver ouvindo, ouve
export class PaymentAuthorizedEvent extends OrderEvent {}

@TransportType(Transport.REDIS, Transport.RMQ)      // moveu dinheiro: aviso + fila com ack
export class PaymentCapturedEvent extends OrderEvent {}

export class PostCreatedEvent {}                    // sem decorator: não sai do processo
```

A decisão é do evento porque **quem escreveu o fato é quem sabe o que ele significa**. Um `PaymentAuthorized` é um aviso: se um assinante perder, a próxima leitura corrige. Um `PaymentCaptured` moveu dinheiro, e o livro-caixa que o registra não pode perder nenhum — por isso ele sai *também* por uma fila, consumida pelo `LedgerController`, com ack. Um fato, dois transportes, dois consumidores, duas garantias.

Nada no domínio ou na aplicação sabe que existe um Redis ou um RabbitMQ: o `@TransportType` fala de *intenção* (difundir, garantir), e o mapa intenção → broker está na configuração do `MessagingModule`.

> Esta é a ideia do [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus), reimplementada aqui. A lib em si não dava: ela parou no NestJS 7 / rxjs 6 (última publicação em 2021) e carrega uma **segunda cópia do framework** — o `@nestjs/cqrs` 7.0.1 que ela injeta é uma classe diferente do nosso 12. E o `@TransportEvent()` dela reconstrói o evento recebido como uma classe anônima *renomeada*, o que engana o `constructor.name` mas falha em todo `instanceof` — sagas e subscriptions ficariam mudas. O que sobrevive é o desenho, que é o que vale.

### 3. Evento remoto **notifica**, mas não **dispara**

Esta é a decisão que faz a saga compartilhada funcionar. Os dois serviços registram a **mesma** `OrderSaga`, com as quatro regras. Se o que vem do Redis caísse no `EventBus`, os dois reagiriam ao mesmo fato — dois `payment.capture`, cobrança dobrada.

Então há dois barramentos:

| | quem alimenta | quem escuta |
|---|---|---|
| `EventBus` | só o processo local | sagas, `@EventsHandler`, e o `EventStream` |
| `RemoteEventBus` | só os outros processos | o `EventStream` |
| **`EventStream`** | **os dois** | **os `@SubscriptionHandler`** |

Quem **reage com um command** quer agir uma vez, no dono do fato. Quem **assiste ao fluxo** quer ver tudo, inclusive o que rodou do outro lado. Duas necessidades, dois streams — e a regra fica estrutural em vez de combinada: sem flag de "sou o dono", sem `if` de origem espalhado pelas sagas. Registrar a saga inteira nos dois lados passa a ser inofensivo, e é isso que permite ela ser uma peça só.

Num processo só, sem transporte ligado ao `RemoteEventBus`, o `EventStream` **é** o `EventBus` e não custa nada.

### `Order.payment`: um campo cujo dado vive em outro serviço

O pedido é do `apps/api`; o pagamento é do `apps/payments`. Ainda assim o schema relaciona os dois:

```graphql
type Order  { key: ID!  status: OrderStatus!  amount: Int!  payment: Payment  … }
type Payment { status: PaymentStatus!  amount: Int!  authorizationId: ID  receiptId: ID  reason: String  updatedAt: DateTime! }
```

A API não tem o agregado `Payment` — ela tem os **eventos** que o outro serviço publicou. Então ela faz o que o lado de leitura do CQRS sempre fez: a `PaymentProjection` escuta o `EventStream` e vai montando um read model por chave de pedido. `Order.payment` é um `@ResolveField` sobre ele, `null` enquanto o adquirente não respondeu — que é o estado real de um pedido recém-criado, e não um dado faltando.

Repare que a projeção usa **a mesma fonte** da subscription `onOrderUpdated`. Não é coincidência: as duas são leitura, e as duas precisam ver o fluxo inteiro, venha de onde vier. Uma entrega o passo ao cliente na hora; a outra acumula o estado para quem perguntar depois. O `EventStream` existe para esse par.

### E os dois transportes, por que dois

| | quem decide | transporte | entrega |
|---|---|---|---|
| **evento — aviso** | a classe, com `@TransportType(Transport.REDIS)` | Redis pub/sub | todos os inscritos; perder um é sobreviver |
| **evento — durável** | a classe, com `@TransportType(Transport.RMQ)` | RabbitMQ | um consumidor, com ack; não se perde |
| **command** | quem emite o `EnqueueCommand`, nomeando o serviço | RabbitMQ | um consumidor, com fila |

Um evento entregue a dois serviços é o objetivo; um command entregue a dois seria uma cobrança duplicada. E um evento que moveu dinheiro pode precisar das duas coisas ao mesmo tempo — que é exatamente o caso do `PaymentCapturedEvent`.

A saga nunca vê nenhum dos dois: ela emite um `EnqueueCommand(serviço, padrão, payload)`, e o handler dele é a única classe do sistema que sabe que existe um RabbitMQ.

**O preço de ter dois transportes: a ordem de entrega entre eles não existe.** Os passos chegam ao assinante por dois caminhos — os do pagamentos por Redis, os da API pelo `EventBus` local depois de uma ida e volta pelo RabbitMQ. Dois transportes independentes não têm relógio comum, então `DECLINED` e `FAILED` (publicados quase no mesmo instante, um em cada serviço) podem chegar trocados. Não é defeito: é o que se paga por a fila garantir que o trabalho aconteça **uma vez**.

O que o sistema garante é a ordem **causal**, e ela viaja no payload: todo evento carrega `occurredAt`, e um fato causado por outro tem instante posterior. Um cliente que precise exibir a linha do tempo ordena por ele — que é para isso que ele está lá. O `order.e2e-spec` afirma exatamente isso, e não a ordem de chegada; foi uma corrida que apareceu na terceira rodada repetida do teste, não em teoria.

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
| `@nestjs/microservices` + `amqplib` / `amqp-connection-manager` | o transporte RabbitMQ dos commands |
| `ioredis` | o pub/sub dos eventos entre os serviços |
| Vitest + `unplugin-swc` | testes (a receita do Nest para SWC; o Jest não faz `require()` de ESM no Node 22) |

## Camadas

As mesmas três regras da versão Java, e os mesmos três diretórios de raiz agrupados por papel:

1. **Uma classe por handler.** Cada command, query e subscription tem a sua classe de handler, ao lado da mensagem que ela trata.
4. **O filtro é da mensagem.** Quem pede uma subscription monta o *critério*; quem escreve a subscription decide o que ele *quer dizer*. O `filter` mora na classe da mensagem, na camada de aplicação — a interface nunca peneira stream.
2. **O domínio dispara, a aplicação ouve.** Os eventos vivem em `domain/*/event`; quem os dispara são as entidades, por `apply(...)`. Quem os ouve mora em `application/post/event` (a saga) e `application/post/subscription` (as subscriptions).
3. **O command decide e salva; o evento notifica e orquestra.** O handler chama o domínio, grava a entidade e só então faz `commit()`. A saga não grava nada: despacha commands.

```
apps/api/src                                     # o serviço HTTP + GraphQL
├── app.module.ts, main.ts                       # as camadas são os diretórios; sobe híbrida (HTTP + RabbitMQ)
├── dto/graphql                                  # a forma do dado NO PROTOCOLO (@ObjectType / @InputType)
│   ├── create-post.input, update-post.input     #   entrada: espelham os input do schema
│   ├── post.view, tag.view                      #   saída: achatam os value objects para o schema
│   └── connection, post.connection              #   PageInfo + Connection(classRef) → PostConnection, TagConnection
├── ledger/payment-ledger                        # o consumidor durável: escuta a fila, não a difusão
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
│   │   └── subscription/on-post-created, on-post-updated          # Subscription<evento, critério> (com o filter)
│   │                                                              #   + @SubscriptionHandler que liga ao EventBus
│   └── tag/command/create-tag (.command + .handler)
├── infrastructure/persistence/sqlite            # escolhas de deploy; nenhuma regra de negócio
│   ├── mikro-orm.config                         #   SQLite, ensureDatabase, POSTS_DB
│   └── mikro-orm-post.repository, mikro-orm-tag.repository       # adapters das portas (findByCursor aqui)
└── interfaces
    ├── graphql                                  #   post-query/mutation/subscription.resolver, post-tags.resolver
    │   └── order.resolver                       #   placeOrder + order + Order.payment + onOrderUpdated(key)
    ├── messaging/order.controller               #   a fila order.api: os commands da coreografia
    └── messaging/ledger.controller              #   a MESMA fila: o PaymentCaptured durável → PaymentLedger

apps/payments/src                                # o microserviço: sem HTTP, sem banco
├── payments.module, main                        #   NestFactory.createMicroservice(RMQ)
└── payments.controller                          #   @EventPattern payment.authorize / payment.capture

libs/cqsrs/src                                   # CQSRS: a terceira mensagem. Não sabe o que é GraphQL
├── interfaces                                   #   O CONTRATO: ISubscription (key + filter + tipo do evento),
│                                                #   ISubscriptionHandler (subscribe → Observable), ISubscriptionBus
├── classes/subscription                         #   o helper do contrato: criteria (dado) → key, filter (regra)
├── subscription-bus                             #   subscribe(): acha o handler, aplica o filter, compartilha por chave
├── cqsrs.module                                 #   CqrsModule + SubscriptionBus; forRoot e forRootAsync
├── decorators/subscription-handler              #   @SubscriptionHandler(Sub) — as duas metadatas
├── services/subscription-explorer               #   varre os providers no bootstrap, como o ExplorerService do cqrs
├── exceptions                                   #   handler não encontrado / handler inválido
├── remote-event-bus, event-stream               #   o que veio de fora / local + remoto (a fonte das subscriptions)
└── helpers                                      #   subscription-key (o critério → chave estável)
                                                 #   observable-to-async-iterable (Observable → AsyncIterableIterator)
                                                 #   subscribe-as-async-iterable (o que um resolver chama)

libs/order/src                                   # o domínio do pedido — importado pelos DOIS serviços
├── domain                                       #   Order e Payment (AggregateRoot), os 6 eventos, a chave
├── application/order.saga                       #   A SAGA COREOGRAFADA: 4 regras, registrada nos dois
├── application/command                          #   os 5 commands e seus handlers
├── application/subscription/on-order-updated    #   Subscription<OrderEvent, { key }> + handler no EventStream
├── application/projection/payment.projection    #   read model de Order.payment, dos eventos do outro serviço
└── application/order-routes                     #   serviços, filas e padrões: um nome só para os dois lados

libs/messaging/src                               # a mensageria. Não sabe o que é um pedido
├── transport/transport-type.decorator           #   @TransportType(...) e @ExcludeLocal: a escolha, no evento
├── transport/transport-event-bus                #   troca o publisher do EventBus e roteia por transporte
├── transport/inbound-event.dispatcher           #   descarta o próprio eco, reconstrói a classe, → RemoteEventBus
├── transport/notification-events.controller     #   @EventPattern da difusão; registrado nos dois serviços
├── messaging.module                             #   ClientsModule (Redis + RMQ) + o roteamento de eventos
├── event-registry                               #   nome ↔ classe: reconstrói a instância do outro lado
└── enqueue.command + .handler                   #   o único command que atravessa processo
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
| `subscriptionQuery` + `QueryUpdateEmitter.emit(...)` | `Subscription<Evento, Critério>` + `@SubscriptionHandler`; `subscriptionBus.subscribe(sub)` devolve `eventBus.pipe(ofType(Evento))` filtrado |
| `Flux` no `@SubscriptionMapping` + SSE | `subscribeAsAsyncIterable(bus, sub, projeção)` no `@Subscription` + graphql-ws |
| filtro por tópico avaliado no `emit` (`sub -> sub.matches(id)`) | `filter(event)` na própria `Subscription`, aplicado pelo bus dentro do stream — e o critério é a chave que compartilha o stream |
| `ScrollSubrange` / `Window` do Spring Data | `em.findByCursor` do MikroORM: itens + `hasNextPage` + cursores prontos |
| `@Embeddable record` com validação no construtor | schema Zod `.brand<'PostTitle'>()`: só o `parse` produz o tipo |
| `@ElementCollection(LAZY)` + DataLoader | `p.embedded(TagRef).array()` — JSON na própria linha; não há N+1, não há DataLoader |
| MapStruct | `PostInputMapper` / `PostViewMapper` injetáveis, à mão |
| Bean Validation na borda + VO no domínio | uma altura só: o domínio (Zod); o `DomainExceptionFilter` traduz para `BAD_USER_INPUT` |
| `AppGraphQlExceptionHandler` | `APP_FILTER` com um `ExceptionFilter` que **devolve** um `GraphQLError` |

## Rodando

```bash
pnpm install
pnpm infra:up            # Redis (6399) e RabbitMQ (5699) — portas deslocadas de propósito, ver abaixo
pnpm start:dev           # apps/api  — http://localhost:3000/graphql
pnpm start:payments      # apps/payments — só a fila
```

As portas dos brokers **não** são as canônicas (6379/5672). Quem desenvolve costuma ter um Redis e um RabbitMQ de outro projeto ocupando as padrão, e o custo de descobrir isso é um teste que falha de um jeito que não parece porta ocupada — ele *conecta*, no broker errado.

O fluxo do pedido, na mão (o cliente assina **antes** de mandar):

```graphql
subscription { onOrderUpdated(key: "3f2a…") { step detail occurredAt } }
```
```graphql
mutation { placeOrder(input: { key: "3f2a…", amount: 4990, customer: "manuel" }) { status payment { status } } }
```

O assinante recebe `STARTED` → `AUTHORIZED` → `CAPTURED` → `COMPLETED`, dois deles disparados no serviço de pagamentos. Acima de `100000` centavos o adquirente recusa e o fluxo vira `STARTED` → `DECLINED` → `FAILED`.

`scripts/order-smoke.mjs` faz exatamente isso contra os dois serviços buildados (`node scripts/order-smoke.mjs`, com `PORT` apontando para a API).

## Testando na mão (os posts)

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
pnpm infra:up    # os e2e do pedido precisam do Redis e do RabbitMQ
pnpm test        # unitários e de handler (apps/**/*.spec.ts, libs/**/*.spec.ts)
pnpm test:e2e    # as aplicações inteiras, por HTTP + WebSocket + os dois brokers
pnpm test:all
```

- `post.entity.spec` / `tag.entity.spec` — domínio puro. O único colaborador é o próprio aggregate root: `getUncommittedEvents()` diz exatamente o que foi disparado, sem `EventPublisher`, sem `EventBus`, sem ORM. Os testes `the state returned by update is the same as sourcing the raised events` (via `loadFromHistory`) e `applying the same event twice leaves the same state` travam o contrato decidir/evoluir.
- `create-post.handler.spec`, `update-post.handler.spec`, `assign-tag-to-post.handler.spec`, `create-tag.handler.spec` — um por handler, com `@nestjs/testing`. O fixture (`test/support/cqrs-testing-module.ts`) monta o `CqsrsModule` de verdade, o MikroORM de verdade num SQLite em memória, os repositórios — e **só o handler do teste**, então uma dependência acidental entre dois deles quebra o teste. Não há repositório fake: como salvar é responsabilidade do command, o banco é quem prova que ele salvou, e um `RecordingEvents` pendurado no `EventBus` prova o que ele publicou.
- `find-all-posts.handler.spec` — a mecânica da cursor connection de `posts`: a linha a mais que decide o `hasNextPage` nunca vaza, o `endCursor` de uma página é o `after` da seguinte.
- `assign-default-tag-on-post-created.saga.spec` — a saga é uma função `Observable → Observable`: alimenta-se um `of(evento)` e colhem-se os commands. Cria a tag quando não existe, reusa quando existe, serializa dois posts criados ao mesmo tempo, e **sobrevive a uma falha** (sem o `catchError` por evento, o `EventBus` completaria o stream e nenhum post futuro ganharia tag).
- `post-tags.resolver.spec` — o recorte em memória de `Post.tags`, que é a parte da connection que é lógica nossa.
- `subscription-bus.spec` — o `SubscriptionBus` num módulo Nest de verdade (`CqsrsModule.forRoot()`, explorer e tudo): roteia a mensagem para o seu `@SubscriptionHandler`, aplica o `filter` da mensagem dentro do stream, entrega **o mesmo `Observable`** para o mesmo critério (dois assinantes, uma inscrição no `EventBus`, o handler chamado uma vez só), separa critérios diferentes, desliga a fonte quando o último assinante sai e a religa sob demanda, e explode com `SubscriptionHandlerNotFoundException` quando ninguém trata a mensagem.
- `cqsrs.module.spec` — o módulo: `forRootAsync` nas quatro formas (`useValue`, `useFactory` com `inject`, `useClass`, `useExisting`), as opções chegando **nos dois lados** (o `subscriptionPublisher` no `SubscriptionBus`, o `eventPublisher` no `EventBus` — prova de que o resto é repassado ao `CqrsModule`), a factory de quem chama rodando **uma vez só**, e o `@SubscriptionHandler` registrado no bootstrap também pelo caminho assíncrono.
- `subscription-key.spec` — a chave: mesma coisa em qualquer ordem dá a mesma chave, `undefined` é o mesmo que ausente, `null` não é, arrays mantêm a ordem.
- `on-post-updated.subscription.spec` — o filtro por tópico como o que ele é: regra de aplicação, testada sem subir bus nenhum.
- `observable-to-async-iterable.spec` — o helper: entrega em ordem, `return()` cancela a inscrição **mesmo com um `next()` pendente**, erro propaga.
- `event-stream.spec` — **a invariante do sistema distribuído**, sem broker nenhum: um evento local notifica a subscription *e* dispara a saga; um evento no `RemoteEventBus` **só notifica**. É o que garante que a mesma saga registrada nos dois serviços não reaja duas vezes ao mesmo fato.
- `transport-event-bus.spec` — **a escolha de transporte por evento**, sem broker nenhum (os `ClientProxy` são dublês): um evento sem decorator não sai do processo, um `@TransportType(REDIS)` é difundido *e* publicado localmente, um `@TransportType(REDIS, RMQ)` sai pelos dois com o mesmo envelope, um `@ExcludeLocal()` pula o barramento local, e um transporte não configurado é ignorado sem perder a publicação local.
- `event-registry.spec` — a serialização que atravessa processo: o evento volta como **instância da classe** (senão `ofType` e `instanceof` não reconheceriam nada), com as datas de volta a `Date`, e um tipo desconhecido é ignorado.
- `order.saga.spec` — as quatro regras da coreografia, uma a uma: a saga é uma função `Observable → Observable`, então alimenta-se um evento e colhe-se o `EnqueueCommand`.
- `order.spec` — os agregados: o que recusa nascer, e que `complete`/`fail`/`capture` repetidos são **no-ops** — numa fila, uma mensagem pode chegar duas vezes.
- `payment.projection.spec` — o read model de `Order.payment`, alimentado pelo `RemoteEventBus` (que é por onde os eventos de pagamento chegam de verdade): o pagamento é `undefined` até o adquirente responder, a captura preserva o `authorizationId` do passo anterior, e a recusa guarda motivo e valor.
- `domain-exception.filter.spec` — a tabela exceção → `extensions.code`.
- `order.e2e-spec` — **os dois serviços de verdade** (containers de DI separados, no mesmo processo) com **Redis e RabbitMQ de verdade**, do `docker-compose.yml`. Nada de mock: o que atravessa é JSON num socket. Prova, nesta ordem de importância: (1) a coreografia acontece — quatro passos, dois em cada serviço, sem orquestrador; (2) a subscription vê os quatro, inclusive os dois do outro processo, e é a chave do cliente que os junta; (3) **a saga compartilhada não duplica** — contando os `EnqueueCommand` de cada serviço, a API só emite `payment.authorize` e o pagamentos só emite `payment.capture` e `order.complete`; (4) a chave deduplica o pedido e permite assinar antes de começar; (5) **`Order.payment` é construído dos eventos do outro serviço** — `authorizationId` e `receiptId` chegaram por Redis, e o campo é `null` enquanto o adquirente não respondeu; (6) **o mesmo `PaymentCaptured` chega pelos dois transportes** — o `CAPTURED` da subscription veio da difusão, e a linha do livro-caixa veio da fila, com o mesmo comprovante; e o caminho de recusa, que não gera linha nenhuma no livro-caixa.
- `posts.e2e-spec` — o smoke test como teste: sobe o `AppModule` com SQLite em memória (`POSTS_DB` no `vitest.e2e.config.mts`), fala HTTP para queries/mutations e graphql-ws para subscriptions. Confere a ordem command → evento → entrega, a chegada da tag padrão por `onPostUpdated`, o filtro por tópico (o assinante filtrado vê só o seu post; o global vê tudo), os erros com código, as duas connections — que desassinar tira o assinante do `EventBus` na hora, contando os `observers` do `Subject`, e que **dois assinantes do mesmo tópico compartilham um stream só**: o `EventBus` não passa de um assinante, os dois recebem o mesmo payload, e a fonte só cai quando o segundo sai.

## Decisões que valem comentar

**O `EventBus` é o emitter.** Não há `PubSub` do `graphql-subscriptions`, não há `Subject` novo, não há `@EventsHandler` que "emite" para as subscriptions. `ObservableBus` estende `Observable`, e `ofType` é o operador que o próprio @nestjs/cqrs exporta para as sagas. Uma subscription GraphQL ouve o mesmo stream que a saga da tag padrão. Cada *stream* do `SubscriptionBus` é exatamente um `subscribe` no `Subject` — o e2e prova isso contando `eventBus.subject$.observers`.

**Subscription é uma mensagem própria, não uma query.** A primeira versão modelava subscription como query: `OnPostUpdatedSubscription extends Query<Observable<PostUpdatedEvent>>`, e o `QueryBus.execute` devolvia o `Observable` inteiro porque um `Observable` não é *thenable* — `await` de um não-thenable devolve ele mesmo. Funcionava, mas por acidente: o contrato dizia "uma resposta e acabou" (`Promise<T>`) enquanto o valor era "um stream que fica aberto". E `execute` não é o verbo de quem se inscreve.

Daí o `libs/cqsrs`: `ISubscription<TEvent>` (com o helper `Subscription<TEvent, TCriteria>`), `@SubscriptionHandler`, `ISubscriptionHandler` com `subscribe(): Observable<TEvent>` e um `SubscriptionBus` com a mesma anatomia do `QueryBus` (um `Map` de handlers por id de mensagem, um publisher, um explorer que varre os providers no bootstrap) mais o que só um stream precisa: um `Map` do que está no ar. Decidir quais eventos alimentam qual subscription continua sendo regra da aplicação; a interface só converte o stream para o transporte.

**Uma factory, não duas.** `CqsrsModule.forRootAsync` tem um problema que o `forRoot` não tem: as opções servem a dois módulos — o `CqsrsModule` (que só quer o `subscriptionPublisher`) e o `CqrsModule` embaixo (que quer todo o resto). O caminho ingênuo é passar as `CqsrsModuleAsyncOptions` para os dois, e aí a `useFactory` de quem chamou roda **duas vezes** — o que é no mínimo surpreendente, e no pior caso abre duas conexões. A saída é resolver as opções num módulo só (`CqsrsOptionsModule`, que as exporta pelo token `CQSRS_MODULE_OPTIONS`) e dar ao `CqrsModule.forRootAsync` uma factory que apenas repassa o que já foi resolvido. O mesmo objeto de módulo dinâmico entra nas duas listas de `imports`: o Nest identifica um módulo dinâmico pelo par (classe, metadata), então as duas referências são o mesmo módulo, com uma instância só. O `cqsrs.module.spec` trava isso contando as chamadas.

**O contrato é a interface; a classe é conveniência.** `IQuery` e `ICommand` do @nestjs/cqrs são marcadores vazios, porque os buses deles não precisam de nada da mensagem: o roteamento vem da metadata da classe. Um bus de subscriptions precisa de três coisas que só a mensagem sabe — `filter` (este evento interessa?), `key` (quem é este pedido?) e o tipo do evento (um símbolo fantasma, como o `RESULT_TYPE_SYMBOL` do `Query<T>`). Então a `ISubscription` declara as três, e o bus depende **dela**, não de herança: qualquer classe que cumpra o contrato é roteável — a `Subscription` é só o helper que resolve as três a partir de um *critério*. O `subscription-bus.spec` prova o caminho agnóstico com uma subscription que não herda nada.

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

- Event store de verdade: trocar o `DefaultPubSub` por um `IEventPublisher` que apende antes de publicar (`eventPublisher` nas opções do `CqsrsModule`, repassadas ao `CqrsModule`), e `loadFromHistory` no repositório — o domínio já suporta replay.
- **Subscriptions entre instâncias da *mesma* app.** O `RemoteEventBus` já resolve "o fato aconteceu em outro serviço"; com N réplicas da API atrás de um balanceador, o assinante conectado à réplica A precisa ver o evento publicado na réplica B — o que o mesmo canal Redis já entrega, bastando que a origem passe a ser a instância, e não o serviço.
- **Outbox.** Hoje o `TransportEventBus` difunde dentro do `commit()`. Se o processo morrer entre gravar e publicar, o evento se perde. O passo é gravar o evento na mesma transação do agregado e publicá-lo a partir dali.
- **Persistir pedido e projeção.** O `InMemoryStore` e o `Map` da `PaymentProjection` são honestos para a POC (o que se quer provar é a coreografia), mas mereciam um banco cada — e nada acima da porta `OrderRepository` mudaria.
- Mutations de tag (`createTag`, `assignTag`, `removeTag`) — command e agregado já existem; falta o `@Mutation`.
- Projeção nos event handlers (tirar o `save` do command) para recuperar o read model derivado do stream.
- Backpressure no helper (descartar ou limitar a fila) para assinantes lentos.
- Paginação por keyset também em `Post.tags`, se as tags virarem relação.
