import { Module } from '@nestjs/common';
import { DefaultTagSeeder } from './default-tag.seeder';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { TagRepository } from '@nestposts/posts/domain/tag/tag.repository';
import { AuthorRepository } from '@nestposts/users/domain/user/author.repository';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import { MikroOrmAuthorRepository } from '@nestposts/users/infrastructure/persistence/repositories/mikro-orm-author.repository';
import { MikroOrmPostRepository } from '@nestposts/posts/infrastructure/persistence/repositories/mikro-orm-post.repository';
import { MikroOrmTagRepository } from '@nestposts/posts/infrastructure/persistence/repositories/mikro-orm-tag.repository';
import { MikroOrmUserRepository } from '@nestposts/users/infrastructure/persistence/repositories/mikro-orm-user.repository';

@Module({
  providers: [
    DefaultTagSeeder,
    { provide: PostRepository, useClass: MikroOrmPostRepository },
    { provide: TagRepository, useClass: MikroOrmTagRepository },
    { provide: UserRepository, useClass: MikroOrmUserRepository },
    { provide: AuthorRepository, useClass: MikroOrmAuthorRepository },
  ],
  exports: [PostRepository, TagRepository, UserRepository, AuthorRepository],
})
export class PersistenceModule {}
