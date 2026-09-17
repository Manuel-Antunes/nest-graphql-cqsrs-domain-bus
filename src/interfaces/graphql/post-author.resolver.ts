import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import type { Author } from '../../domain/user/author.entity';
import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';
import { User } from '../../domain/user/user.entity';
import { AuthorView } from '../../dto/graphql/user.view';
import type { PostView } from '../../dto/graphql/post.view';

@Resolver('Post')
export class PostAuthorResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveField('author')
  @UseInterceptors(MapInterceptor(User, AuthorView))
  async author(@Parent() post: PostView): Promise<Author> {
    const author = await this.queryBus.execute(new FindAuthorQuery.FindAuthor(post.authorId));
    if (!author) {
      throw new NotAnAuthorException(post.authorId);
    }
    return author;
  }
}
