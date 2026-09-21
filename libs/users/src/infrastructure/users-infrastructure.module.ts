import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/platform/infrastructure/persistence/database.module';
import { AuthorRepository } from '../domain/user/author.repository';
import { UserRepository } from '../domain/user/user.repository';
import { AuthorshipEntitySchema, UserEntitySchema } from './persistence/entities/user-orm.entity';
import { MikroOrmAuthorRepository } from './persistence/repositories/mikro-orm-author.repository';
import { MikroOrmUserRepository } from './persistence/repositories/mikro-orm-user.repository';

/**
 * The tables this module owns: the user's row and the authorship that makes an Author out of it. The
 * Better Auth tables are not here — they belong to `IdentityModule`, which declares them itself.
 */
export const usersEntities = [UserEntitySchema, AuthorshipEntitySchema];

/**
 * **The `users` module's adapters, bound to its ports** — the user and the author, which is the same
 * row read through two aggregates (see the delegation in `@nestposts/platform`).
 *
 * It does **not** bring identity. `IdentityModule` is the other half of this module's infrastructure —
 * Better Auth behind the `IdentityProvider` port — and it stays a module of its own because a service
 * that reads users has no reason to boot an authentication stack to do it.
 */
@Module({
  imports: [DatabaseModule.forFeature(usersEntities)],
  providers: [
    { provide: UserRepository, useClass: MikroOrmUserRepository },
    { provide: AuthorRepository, useClass: MikroOrmAuthorRepository },
  ],
  exports: [UserRepository, AuthorRepository],
})
export class UsersInfrastructureModule {}
