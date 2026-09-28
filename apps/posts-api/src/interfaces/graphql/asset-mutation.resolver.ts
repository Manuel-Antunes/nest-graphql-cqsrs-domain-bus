import { QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { OptionalAuth, Session } from '@thallesp/nestjs-better-auth';

import { GeneratePresignedUrlQuery } from '../../application/asset/query/generate-presigned-url.query';
import { GeneratePresignedUrlInput } from '../../dto/graphql/generate-presigned-url.input';

@Resolver()
export class AssetMutationResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @OptionalAuth()
  @Mutation('generatePresignedUrl')
  generatePresignedUrl(
    @Args('input') input: GeneratePresignedUrlInput,
    @Session() session?: UserSession | null,
  ): Promise<GeneratePresignedUrlQuery.PresignedUpload> {
    return this.queryBus.execute(
      new GeneratePresignedUrlQuery.GeneratePresignedUrl(
        session ? UserId.parse(session.user.id) : null,
        input.mimeType,
      ),
    );
  }
}
