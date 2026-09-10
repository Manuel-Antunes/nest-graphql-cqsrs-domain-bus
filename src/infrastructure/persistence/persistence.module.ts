import { Module } from '@nestjs/common';
import { PostRepository } from '../../domain/post/post.repository';
import { TagRepository } from '../../domain/tag/tag.repository';
import { UserRepository } from '../../domain/user/user.repository';
import { MikroOrmPostRepository } from './sqlite/repositories/mikro-orm-post.repository';
import { MikroOrmTagRepository } from './sqlite/repositories/mikro-orm-tag.repository';
import { MikroOrmUserRepository } from './sqlite/repositories/mikro-orm-user.repository';

/**
 * As portas do domínio ligadas aos adapters do MikroORM — o único módulo que conhece as duas pontas.
 *
 * Ele existe justamente para que `src/application/` **não** precise conhecê-las. Antes estas três
 * linhas moravam no `AppModule`, junto dos handlers; agora quem as importa recebe `PostRepository`,
 * `TagRepository` e `UserRepository` sem nunca ver o nome de quem as implementa. Trocar o SQLite por
 * outra coisa é reescrever este ficheiro, e só ele.
 *
 * Repare no que **não** está nos `exports`: as classes `MikroOrm*Repository`. O que sai daqui são as
 * portas — abstratas, e ao mesmo tempo o token de injeção (ver {@link PostRepository}). É essa
 * assimetria que impede um handler de alcançar o adapter por engano: ele não está exportado, então
 * pedi-lo não compila… e nem sequer resolve em runtime.
 *
 * Sem `imports`: os três repositórios injetam `EntityManager`, e o `MikroOrmCoreModule` é `@Global()`
 * — o `MikroOrmModule.forRoot` do `AppModule` já o torna visível em toda a aplicação.
 */
@Module({
  providers: [
    { provide: PostRepository, useClass: MikroOrmPostRepository },
    { provide: TagRepository, useClass: MikroOrmTagRepository },
    { provide: UserRepository, useClass: MikroOrmUserRepository },
  ],
  exports: [PostRepository, TagRepository, UserRepository],
})
export class PersistenceModule {}
