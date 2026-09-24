import { QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { Author } from '@nestposts/users/domain/user/author.entity';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { Roles } from '@thallesp/nestjs-better-auth';

import { GeneratePresignedUrlQuery } from '../../application/asset/query/generate-presigned-url.query';
import { GeneratePresignedUrlInput } from '../../dto/graphql/generate-presigned-url.input';
import { CurrentAuthor } from '../decorators/current-user.decorator';

@Resolver()
export class AssetMutationResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Roles([AUTHOR_ROLE])
  @Mutation('generatePresignedUrl')
  generatePresignedUrl(
    @Args('input') input: GeneratePresignedUrlInput,
    @CurrentAuthor() author: Author,
  ): Promise<GeneratePresignedUrlQuery.PresignedUpload> {
    return this.queryBus.execute(
      new GeneratePresignedUrlQuery.GeneratePresignedUrl(
        author.id,
        input.mimeType,
      ),
    );
  }
}
