import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
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
 * - `CqrsModule`: `CommandBus`, `QueryBus`, `EventBus` (o `Observable` que alimenta as subscriptions),
 *   `EventPublisher` e o registro de handlers e sagas;
 * - `MikroOrmModule`: o ORM e o middleware que abre um contexto (fork do EntityManager) por request;
 * - `GraphQLModule` com o driver Apollo: schema code-first gerado dos decorators e subscriptions
 *   sobre WebSocket em `/graphql`, pelo protocolo graphql-ws.
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
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
