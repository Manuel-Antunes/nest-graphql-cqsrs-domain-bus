import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import { PostRepository } from '../domain/post/post.repository';
import { TagRepository } from '../domain/tag/tag.repository';
import { PostEntitySchema } from './persistence/entities/post-orm.entity';
import { TagSchema } from './persistence/entities/tag-orm.entity';
import { MikroOrmPostRepository } from './persistence/repositories/mikro-orm-post.repository';
import { MikroOrmTagRepository } from './persistence/repositories/mikro-orm-tag.repository';

/**
 * The tables this module owns. A service that wants the Post's **mapping** without its repositories —
 * `apps/tagging` needs it to rehydrate a Post whose table it does not have — imports
 * `DatabaseModule.forFeature(postsEntities)` and nothing else.
 */
export const postsEntities = [PostEntitySchema, TagSchema];

/**
 * **The `posts` module's adapters, bound to its ports.** Whoever needs a `PostRepository` imports this
 * and gets it; whoever does not, does not have it.
 *
 * ## Why it lives here and not in the application
 * Because everything it declares lives here: the ports are abstract classes in `domain/`, the MikroORM
 * implementations are in `infrastructure/persistence/repositories/`, and **the tables are here too** —
 * `DatabaseModule.forFeature` is how they reach the application's ORM, so an application's
 * configuration keeps the connection and not a list of every schema in the system. It is the shape
 * `IdentityModule` already has in `libs/users`.
 *
 * ## Why one module per domain module, and not one per layer
 * Because the layer is not what an importer asks for. A handler that touches posts wants `posts`, not
 * "the persistence of everything", and a module boundary that follows the domain says that in its
 * imports — which is also the boundary the libraries already have. The layer rule is unchanged and
 * still enforced: the ports leave through **this** module, so a resolver that never imports it cannot
 * inject a repository.
 */
@Module({
  imports: [DatabaseModule.forFeature(postsEntities)],
  providers: [
    { provide: PostRepository, useClass: MikroOrmPostRepository },
    { provide: TagRepository, useClass: MikroOrmTagRepository },
  ],
  exports: [PostRepository, TagRepository],
})
export class PostsInfrastructureModule {}
