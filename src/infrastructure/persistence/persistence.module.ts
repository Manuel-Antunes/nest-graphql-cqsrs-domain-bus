import { Module } from '@nestjs/common';
import { PostRepository } from '../../domain/post/post.repository';
import { TagRepository } from '../../domain/tag/tag.repository';
import { AuthorRepository } from '../../domain/user/author.repository';
import { UserRepository } from '../../domain/user/user.repository';
import { MikroOrmAuthorRepository } from './sqlite/repositories/mikro-orm-author.repository';
import { MikroOrmPostRepository } from './sqlite/repositories/mikro-orm-post.repository';
import { MikroOrmTagRepository } from './sqlite/repositories/mikro-orm-tag.repository';
import { MikroOrmUserRepository } from './sqlite/repositories/mikro-orm-user.repository';

@Module({
  providers: [
    { provide: PostRepository, useClass: MikroOrmPostRepository },
    { provide: TagRepository, useClass: MikroOrmTagRepository },
    { provide: UserRepository, useClass: MikroOrmUserRepository },
    { provide: AuthorRepository, useClass: MikroOrmAuthorRepository },
  ],
  exports: [PostRepository, TagRepository, UserRepository, AuthorRepository],
})
export class PersistenceModule {}
