import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'node:path';
import { AssignTagToPostCommand } from './application/post/command/assign-tag-to-post.command';
import { CreatePostCommand } from './application/post/command/create-post.command';
import { UpdatePostCommand } from './application/post/command/update-post.command';
import { AssignDefaultTagOnPostCreated } from './application/post/event/assign-default-tag-on-post-created.saga';
import { FindAllPostsQuery } from './application/post/query/find-all-posts.query';
import { FindPostQuery } from './application/post/query/find-post.query';
import { OnPostCreatedSubscription } from './application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from './application/post/subscription/on-post-updated.subscription';
import { CreateTagCommand } from './application/tag/command/create-tag.command';
import { CqsrsModule } from './cqsrs';
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
import { PostInputMapper } from './mapper/post-input.mapper';
import { PostViewMapper } from './mapper/post-view.mapper';

/**
 * A aplicação: os handlers, a saga e as portas → adapters. Compartilhado com os testes e2e.
 *
 * Cada `X.Handler` vem do namespace da mensagem que ele trata — a fatia inteira (mensagem + handler)
 * mora num arquivo só, e o registro é a única linha que fala do handler fora dele. É por isso que a
 * lista abaixo lê como um índice dos casos de uso.
 */
export const applicationProviders = [
  // aplicação — um handler por command / query / subscription, e a saga
  CreatePostCommand.Handler,
  UpdatePostCommand.Handler,
  AssignTagToPostCommand.Handler,
  CreateTagCommand.Handler,
  FindPostQuery.Handler,
  FindAllPostsQuery.Handler,
  OnPostCreatedSubscription.Handler,
  OnPostUpdatedSubscription.Handler,
  AssignDefaultTagOnPostCreated,
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
  PostInputMapper,
  PostViewMapper,
  { provide: APP_FILTER, useClass: DomainExceptionFilter },
];

/**
 * Um módulo só, com as camadas nos diretórios — a POC é pequena o bastante para isso. Os três
 * `forRoot` são as três peças de framework que o projeto integra:
 *
 * - `CqsrsModule`: o `CqrsModule` do Nest (`CommandBus`, `QueryBus`, `EventBus` — o `Observable` que
 *   alimenta as subscriptions —, `EventPublisher` e o registro de handlers e sagas) **mais** o
 *   `SubscriptionBus`, a terceira mensagem e o registro dos `@SubscriptionHandler`;
 * - `MikroOrmModule`: o ORM e o middleware que abre um contexto (fork do EntityManager) por request;
 * - `GraphQLModule` com o driver Apollo: schema code-first gerado dos decorators e subscriptions
 *   sobre WebSocket em `/graphql`, pelo protocolo graphql-ws.
 */
@Module({
  imports: [
    CqsrsModule.forRoot(),
    MikroOrmModule.forRoot(mikroOrmConfig()),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      sortSchema: true,
      graphiql: true,
      subscriptions: { 'graphql-ws': true },
      includeStacktraceInErrorResponses: false,
    }),
  ],
  providers: [...applicationProviders, ...interfaceProviders],
})
export class AppModule {}
