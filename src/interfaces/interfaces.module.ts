import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApplicationModule } from '../application/application.module';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { PostMutationResolver } from './graphql/post-mutation.resolver';
import { PostQueryResolver } from './graphql/post-query.resolver';
import { PostSubscriptionResolver } from './graphql/post-subscription.resolver';
import { PostTagsResolver } from './graphql/post-tags.resolver';
import { PostAuthorResolver } from './graphql/post-author.resolver';
import { UserQueryResolver } from './graphql/user-query.resolver';
import { AuthorPostsResolver } from './graphql/author-posts.resolver';
import { UserProvisioningHooks } from './auth/user-provisioning.hooks';
import { PostInputMapper } from './mapper/post-input.mapper';
import { PostViewMapper } from './mapper/post-view.mapper';
import { UserViewMapper } from './mapper/user-view.mapper';
import { AuthorPipe } from './pipes/author.pipe';
import { SessionUserPipe } from './pipes/session-user.pipe';

/**
 * A borda GraphQL: resolvers, mappers, os pipes de parâmetro e a tradução de erros.
 *
 * É o topo da corrente — `interfaces → application → persistence` —, e por isso é o único módulo de
 * camada que o `AppModule` importa: os outros dois vêm atrás, por transitividade, na ordem em que as
 * dependências mandam.
 *
 * ## Por que os pipes moram aqui
 *
 * `SessionUserPipe` e `AuthorPipe` entram como providers porque o `@CurrentAuthor()` os passa como
 * **classes** (ver {@link CurrentAuthor}), e um pipe assim é instanciado pelo injetor do módulo do
 * resolver. Ou seja: é este módulo que precisa conseguir resolvê-los — daí eles estarem nesta lista,
 * e daí o `imports: [ApplicationModule]`, que é o que faz o `UserProvisioning` do `SessionUserPipe`
 * ficar ao alcance. Tirar esse import quebra no arranque, e não numa request qualquer mais tarde.
 *
 * ## O `APP_FILTER`
 *
 * Continua global mesmo declarado fora do módulo raiz — é o que o token faz. O
 * {@link DomainExceptionFilter} não injeta nada, então o contexto em que ele nasce é indiferente; o
 * `MikroOrmExceptionFilter` segue aplicado por `@UseFilters` no resolver de mutations, onde estava.
 *
 * Sem `exports`: nada fora da borda tem por que alcançar um resolver.
 */
@Module({
  imports: [ApplicationModule],
  providers: [
    PostQueryResolver,
    PostMutationResolver,
    PostSubscriptionResolver,
    PostTagsResolver,
    PostAuthorResolver,
    // a hierarquia de usuário: `me`, o `__resolveType` da interface e o campo `Author.posts`
    UserQueryResolver,
    AuthorPostsResolver,
    PostInputMapper,
    PostViewMapper,
    UserViewMapper,
    // Os pipes que o `@CurrentAuthor()` encadeia. São providers como quaisquer outros — é justamente
    // por participarem da injeção de dependência que a tradução da sessão pôde sair do resolver.
    SessionUserPipe,
    AuthorPipe,
    // A outra borda: o Better Auth chamando para dentro. É um provider como os resolvers porque é o
    // `DiscoveryService` do `AuthModule` que o encontra — ver `UserProvisioningHooks`.
    UserProvisioningHooks,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class InterfacesModule {}
