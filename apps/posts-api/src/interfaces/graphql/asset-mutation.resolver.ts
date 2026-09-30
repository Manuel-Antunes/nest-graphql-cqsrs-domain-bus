import { QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CurrentIdentity } from '@nestposts/auth/decorators/current-identity.decorator';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';

import { GeneratePresignedUrlQuery } from '../../application/asset/query/generate-presigned-url.query';
import { GeneratePresignedUrlInput } from '../../dto/graphql/generate-presigned-url.input';

@Resolver()
export class AssetMutationResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @OptionalAuth()
  @Mutation('generatePresignedUrl')
  generatePresignedUrl(
    @Args('input') input: GeneratePresignedUrlInput,
    @CurrentIdentity() identity: Identity | null,
  ): Promise<GeneratePresignedUrlQuery.PresignedUpload> {
    return this.queryBus.execute(
      new GeneratePresignedUrlQuery.GeneratePresignedUrl(
        identity?.kind === 'user' ? identity.userId : null,
        input.mimeType,
      ),
    );
  }
}
