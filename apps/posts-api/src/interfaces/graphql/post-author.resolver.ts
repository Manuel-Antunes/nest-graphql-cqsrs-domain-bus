import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { Author } from '@nestposts/users/domain/user/author.entity';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { User } from '@nestposts/users/domain/user/user.entity';

import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import type { PostView } from '../../dto/graphql/post.view';
import { AuthorView } from '../../dto/graphql/user.view';

@Resolver('Post')
export class PostAuthorResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveField('author')
  @UseInterceptors(MapInterceptor(User, AuthorView))
  async author(@Parent() post: PostView): Promise<Author> {
    const author = await this.queryBus.execute(
      new FindAuthorQuery.FindAuthor(post.authorId),
    );
    if (!author) {
      throw new NotAnAuthorException(post.authorId);
    }
    return author;
  }
}
