import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import { SoftDeleteModule } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.module';

import { AuthorRepository } from '../domain/user/author.repository';
import { UserRepository } from '../domain/user/user.repository';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from './persistence/entities/user-orm.entity';
import { MikroOrmAuthorRepository } from './persistence/repositories/mikro-orm-author.repository';
import { MikroOrmUserRepository } from './persistence/repositories/mikro-orm-user.repository';

/**
 * The tables this module owns: the user's row, in `public`, and the authorship that makes an Author
 * out of it in each tenant. What Better Auth adds to the user is `libs/auth`'s `AuthUser`, mapped on
 * the same row.
 */
export const usersEntities = [UserEntitySchema, AuthorshipEntitySchema];

/**
 * **The `users` module's adapters, bound to its ports** — the user and the author, which is the same
 * row read through two aggregates (see the delegation in `@nestposts/platform`).
 *
 * It does **not** bring identity. `BetterAuthModule` is the other half — Better Auth behind the
 * `IdentityProvider` port — and it stays a module of its own because a service that reads users has
 * no reason to boot an authentication stack to do it.
 */
@Module({
  imports: [DatabaseModule.forFeature(usersEntities), SoftDeleteModule],
  providers: [
    { provide: UserRepository, useClass: MikroOrmUserRepository },
    { provide: AuthorRepository, useClass: MikroOrmAuthorRepository },
  ],
  exports: [UserRepository, AuthorRepository],
})
export class UsersInfrastructureModule {}
