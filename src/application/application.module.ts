import { Module } from '@nestjs/common';
import { IdentityModule } from '../infrastructure/auth/identity.module';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { AssignTagToPostCommand } from './post/command/assign-tag-to-post.command';
import { CreatePostCommand } from './post/command/create-post.command';
import { UpdatePostCommand } from './post/command/update-post.command';
import { AssignDefaultTagOnPostCreated } from './post/event/assign-default-tag-on-post-created.saga';
import { FindAllPostsQuery } from './post/query/find-all-posts.query';
import { FindPostQuery } from './post/query/find-post.query';
import { FindPostsByAuthorQuery } from './post/query/find-posts-by-author.query';
import { OnPostCreatedSubscription } from './post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from './post/subscription/on-post-updated.subscription';
import { CreateTagCommand } from './tag/command/create-tag.command';
import { FindAuthorQuery } from './user/query/find-author.query';
import { UserProvisioning } from './user/user-provisioning.service';

/**
 * Os casos de uso: um handler por command / query / subscription, mais a saga e o provisionamento.
 *
 * Cada `X.Handler` vem do namespace da mensagem que ele trata — a fatia inteira (mensagem + handler)
 * mora num arquivo só, e o registro abaixo é a única linha que fala do handler fora dele. É por isso
 * que a lista lê como um índice dos casos de uso.
 *
 * ## Como estes providers chegam aos buses
 *
 * Não chegam por este módulo. Tanto o `ExplorerService` do @nestjs/cqrs quanto o
 * `SubscriptionExplorerService` do {@link CqsrsModule} varrem o `ModulesContainer` — *todos* os
 * módulos —, então basta que o handler seja um provider em algum lugar da aplicação. O que este
 * módulo decide não é onde eles são encontrados, e sim o que eles conseguem injetar.
 *
 * ## O que entra
 *
 * `PersistenceModule` traz as portas de escrita do domínio; `IdentityModule` traz a porta do
 * **provedor de identidade** ({@link IdentityProvider}), que é como o {@link UserProvisioning}
 * pergunta quem autenticou sem nunca ver o nome `better-auth`. Os buses (`CommandBus`,
 * `EventPublisher`, `AsyncContext`…) não precisam de import: o `CqsrsModule.forRoot()` é
 * `global: true`.
 *
 * Repare no que o `UserProvisioning` deixou de injetar: o `EntityManager`. As duas consultas que ele
 * fazia à mão viraram métodos de porta (`findSupersededByEmail`, `findSupersededBy`) — a aplicação
 * voltou a falar só com contratos.
 *
 * ## O que sai
 *
 * Só o {@link UserProvisioning}, porque a borda precisa dele — é o `SessionUserPipe` que o injeta,
 * para traduzir *quem autenticou* no perfil de domínio. Nenhum handler é exportado, e é de propósito:
 * a borda fala com a aplicação pelos buses, nunca chamando um handler direto. Enquanto os `exports`
 * ficarem nesta única linha, essa regra é verificada no arranque em vez de combinada por escrito.
 */
@Module({
  imports: [PersistenceModule, IdentityModule],
  providers: [
    // aplicação — um handler por command / query / subscription, e a saga
    CreatePostCommand.Handler,
    UpdatePostCommand.Handler,
    AssignTagToPostCommand.Handler,
    CreateTagCommand.Handler,
    FindPostQuery.Handler,
    FindAllPostsQuery.Handler,
    FindPostsByAuthorQuery.Handler,
    FindAuthorQuery.Handler,
    OnPostCreatedSubscription.Handler,
    OnPostUpdatedSubscription.Handler,
    AssignDefaultTagOnPostCreated,
    // identidade: quem autenticou → qual perfil de domínio
    UserProvisioning,
  ],
  exports: [UserProvisioning],
})
export class ApplicationModule {}
