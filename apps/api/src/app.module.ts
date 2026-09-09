import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'node:path';
import { AssignTagToPostCommandHandler } from './application/post/command/assign-tag-to-post.handler';
import { CreatePostCommandHandler } from './application/post/command/create-post.handler';
import { UpdatePostCommandHandler } from './application/post/command/update-post.handler';
import { AssignDefaultTagOnPostCreated } from './application/post/event/assign-default-tag-on-post-created.saga';
import { FindAllPostsQueryHandler } from './application/post/query/find-all-posts.handler';
import { FindPostQueryHandler } from './application/post/query/find-post.handler';
import { OnPostCreatedSubscriptionHandler } from './application/post/subscription/on-post-created.handler';
import { OnPostUpdatedSubscriptionHandler } from './application/post/subscription/on-post-updated.handler';
import { CreateTagCommandHandler } from './application/tag/command/create-tag.handler';
import {
  API_QUEUE,
  API_SERVICE,
  ORDER_EVENTS,
  orderApiProviders,
  PAYMENTS_QUEUE,
  PAYMENTS_SERVICE,
} from '@app/order';
import { CqsrsModule } from '@app/cqsrs';
import {
  DURABLE_EVENT_PATTERN,
  EVENTS_DURABLE_CLIENT,
  EVENTS_NOTIFY_CLIENT,
  MessagingModule,
  NOTIFICATION_EVENT_PATTERN,
  rabbitUrl,
  redisHost,
  redisPort,
} from '@app/messaging';
import { Transport } from '@nestjs/microservices';
import { PostRepository } from './domain/post/post.repository';
import { TagRepository } from './domain/tag/tag.repository';
import { DomainExceptionFilter } from './exceptions/domain-exception.filter';
import { MikroOrmPostRepository } from './infrastructure/persistence/sqlite/mikro-orm-post.repository';
import { MikroOrmTagRepository } from './infrastructure/persistence/sqlite/mikro-orm-tag.repository';
import { mikroOrmConfig } from './infrastructure/persistence/sqlite/mikro-orm.config';
import { PostMutationResolver } from './interfaces/graphql/post-mutation.resolver';
import { PostQueryResolver } from './interfaces/graphql/post-query.resolver';
import { PostSubscriptionResolver } from './interfaces/graphql/post-subscription.resolver';
import { PostTagsResolver } from './interfaces/graphql/post-tags.resolver';
import { OrderResolver } from './interfaces/graphql/order.resolver';
import { PaymentLedger } from './ledger/payment-ledger';
import { LedgerController } from './interfaces/messaging/ledger.controller';
import { OrderMessagingController } from './interfaces/messaging/order.controller';
import { OrderViewMapper } from './mapper/order-view.mapper';
import { PostInputMapper } from './mapper/post-input.mapper';
import { PostViewMapper } from './mapper/post-view.mapper';

/** Como este serviço se apresenta no canal de eventos — a origem que descarta o próprio eco. */
export const API_SERVICE_NAME = 'api';

/** A aplicação: os handlers, a saga e as portas → adapters. Compartilhado com os testes e2e. */
export const applicationProviders = [
  // aplicação — um handler por command / query / subscription, e a saga
  CreatePostCommandHandler,
  UpdatePostCommandHandler,
  AssignTagToPostCommandHandler,
  CreateTagCommandHandler,
  FindPostQueryHandler,
  FindAllPostsQueryHandler,
  OnPostCreatedSubscriptionHandler,
  OnPostUpdatedSubscriptionHandler,
  AssignDefaultTagOnPostCreated,
  // o fluxo do pedido, da lib compartilhada: commands da API, a saga coreografada e a subscription
  ...orderApiProviders,
  // portas do domínio → adapters de infraestrutura
  { provide: PostRepository, useClass: MikroOrmPostRepository },
  { provide: TagRepository, useClass: MikroOrmTagRepository },
];

/** A borda GraphQL: resolvers, mappers e a tradução de erros. */
export const interfaceProviders = [
  PostQueryResolver,
  PostMutationResolver,
  PostSubscriptionResolver,
  PostTagsResolver,
  OrderResolver,
  PostInputMapper,
  PostViewMapper,
  OrderViewMapper,
  // o consumidor durável: escuta a fila, não a difusão (ver PaymentLedger)
  PaymentLedger,
  { provide: APP_FILTER, useClass: DomainExceptionFilter },
];

/**
 * Um módulo só, com as camadas nos diretórios — a POC é pequena o bastante para isso. Os três
 * `forRoot` são as peças de framework que o projeto integra:
 *
 * - `CqsrsModule`: o `CqrsModule` do Nest (`CommandBus`, `QueryBus`, `EventBus` — o `Observable` que
 *   alimenta as subscriptions —, `EventPublisher` e o registro de handlers e sagas) **mais** o
 *   `SubscriptionBus`, a terceira mensagem e o registro dos `@SubscriptionHandler`;
 * - `MikroOrmModule`: o ORM e o middleware que abre um contexto (fork do EntityManager) por request;
 * - `GraphQLModule` com o driver Apollo: schema code-first gerado dos decorators e subscriptions
 *   sobre WebSocket em `/graphql`, pelo protocolo graphql-ws;
 * - `MessagingModule`: a mensageria com **transporte por mensagem**. Os commands vão por fila
 *   (RabbitMQ, um consumidor). Os eventos vão por onde a *classe deles* declarou no
 *   `@TransportType(...)`: difusão (Redis) para os avisos, fila (RabbitMQ) para o que não pode se
 *   perder — e o `PaymentCapturedEvent` vai pelos dois.
 *
 * A aplicação sobe **híbrida** (ver `main.ts`): HTTP para o GraphQL, um listener Redis para as
 * notificações e um listener RabbitMQ na fila `order.api` — que carrega tanto os commands quanto os
 * eventos duráveis. A API não é só quem começa o fluxo; ela também recebe o desfecho.
 */
@Module({
  imports: [
    CqsrsModule.forRoot(),
    MikroOrmModule.forRoot(mikroOrmConfig()),
    MessagingModule.forRoot({
      service: API_SERVICE_NAME,
      events: [...ORDER_EVENTS],
      clients: [
        // filas de command: uma por serviço, um consumidor cada
        { name: PAYMENTS_SERVICE, transport: Transport.RMQ, options: { urls: [rabbitUrl()], queue: PAYMENTS_QUEUE, queueOptions: { durable: false } } },
        { name: API_SERVICE, transport: Transport.RMQ, options: { urls: [rabbitUrl()], queue: API_QUEUE, queueOptions: { durable: false } } },
        // os dois caminhos de evento: difusão e fila
        { name: EVENTS_NOTIFY_CLIENT, transport: Transport.REDIS, options: { host: redisHost(), port: redisPort() } },
        { name: EVENTS_DURABLE_CLIENT, transport: Transport.RMQ, options: { urls: [rabbitUrl()], queue: API_QUEUE, queueOptions: { durable: false } } },
      ],
      eventTransports: [
        { transport: Transport.REDIS, client: EVENTS_NOTIFY_CLIENT, pattern: NOTIFICATION_EVENT_PATTERN },
        { transport: Transport.RMQ, client: EVENTS_DURABLE_CLIENT, pattern: DURABLE_EVENT_PATTERN },
      ],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      sortSchema: true,
      graphiql: true,
      subscriptions: { 'graphql-ws': true },
      includeStacktraceInErrorResponses: false,
    }),
  ],
  controllers: [OrderMessagingController, LedgerController],
  providers: [...applicationProviders, ...interfaceProviders],
})
export class AppModule {}
