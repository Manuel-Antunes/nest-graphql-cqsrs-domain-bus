import { MikroORM, RequestContext } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { GraphQLISODateTime, GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { join } from "node:path";
import { CqsrsModule } from "./cqsrs";
import { createAuth } from "./infrastructure/auth/auth";
import { mikroOrmConfig } from "./infrastructure/persistence/sqlite/mikro-orm.config";
import { InterfacesModule } from "./interfaces/interfaces.module";

/**
 * O composition root: as quatro peças de framework que o projeto integra, e a borda da aplicação.
 *
 * ## As camadas
 *
 * Cada uma é um módulo, no seu próprio diretório, e cada um importa **só** o de baixo:
 *
 * ```
 * InterfacesModule   (src/interfaces/)    resolvers, mappers, pipes, APP_FILTER
 *        ↓ imports
 * ApplicationModule  (src/application/)   handlers, saga, UserProvisioning
 *        ↓ imports
 * PersistenceModule  (src/infrastructure/persistence/)   portas do domínio → adapters do MikroORM
 * ```
 *
 * Só o `InterfacesModule` aparece nos `imports` abaixo: os outros dois entram por transitividade, na
 * ordem em que as dependências mandam. É de propósito — se o root listasse os três, a corrente
 * deixaria de ser visível, e a ordem passaria a ser uma coincidência em vez de uma consequência.
 *
 * O que a divisão compra não é arrumação: é que a fronteira passa a ser **verificada**. Enquanto
 * tudo era uma lista plana de providers, um resolver podia injetar `PostRepository` direto e ninguém
 * daria por isso. Agora não resolve: as portas só saem do `PersistenceModule` para quem o importa, e
 * a única coisa que a borda recebe da aplicação é o `UserProvisioning` que o `SessionUserPipe` pede.
 *
 * O que **não** mudou é a descoberta dos handlers: os explorers do @nestjs/cqrs e do `CqsrsModule`
 * varrem o `ModulesContainer`, então commands, queries, subscriptions e sagas continuam a registrar-se
 * onde quer que morem.
 *
 * ## As peças de framework
 *
 * - `CqsrsModule`: o `CqrsModule` do Nest (`CommandBus`, `QueryBus`, `EventBus` — o `Observable` que
 *   alimenta as subscriptions —, `EventPublisher` e o registro de handlers e sagas) **mais** o
 *   `SubscriptionBus`, a terceira mensagem e o registro dos `@SubscriptionHandler`;
 * - `MikroOrmModule`: o ORM e o middleware que abre um contexto (fork do EntityManager) por request;
 * - `AuthModule`: o Better Auth ligado ao ORM;
 * - `GraphQLModule` com o driver Apollo: schema **schema-first**, carregado de `src/graphql/`, e
 *   subscriptions sobre WebSocket em `/graphql`, pelo protocolo graphql-ws.
 *
 * Os dois primeiros são `global`, e é por isso que os módulos de camada não precisam importá-los:
 * `CqsrsModule.forRoot()` traz `global: true`, e o `MikroOrmCoreModule` é `@Global()`.
 */
@Module({
  imports: [
    CqsrsModule.forRoot(),
    MikroOrmModule.forRoot(mikroOrmConfig()),
    AuthModule.forRootAsync({
      imports: [MikroOrmModule],
      inject: [MikroORM],
      useFactory: (orm: MikroORM) => ({
        auth: createAuth(orm),
        middleware: (_req: unknown, _res: unknown, next: () => void) =>
          RequestContext.create(orm.em, next),
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      /**
       * **Schema-first**: o SDL é a fonte, e não a saída. Nada de `autoSchemaFile` — o que o
       * protocolo promete está escrito em `src/graphql/`, um arquivo por responsabilidade, e os
       * resolvers se ligam a ele pelo nome (`@Resolver('Post')`, `@Query('posts')`).
       *
       * `typePaths` é um glob, e o Nest concatena tudo o que ele casar (`mergeTypeDefs`) — é o que
       * permite `type Query` num arquivo, `type Mutation` noutro e `extend type Post` num terceiro.
       * A raiz é `__dirname` e não `process.cwd()` porque o schema anda **junto do código**:
       * `src/graphql/` quando os testes rodam pelo Vitest, `dist/graphql/` em produção, porque o
       * `nest-cli.json` copia os `.graphql` como asset.
       *
       * `resolvers` é onde um escalar do SDL ganha implementação. `scalar DateTime` é só um nome até
       * alguém dizer como ele serializa — aqui, o `GraphQLISODateTime` do próprio @nestjs/graphql,
       * o mesmo que o code-first pendurava no `@Field(() => GraphQLISODateTime)`.
       */
      typePaths: [join(__dirname, "graphql", "**/*.graphql")],
      resolvers: { DateTime: GraphQLISODateTime },
      graphiql: true,
      subscriptions: { "graphql-ws": true },
      includeStacktraceInErrorResponses: false,
    }),
    InterfacesModule,
  ],
})
export class AppModule {}
