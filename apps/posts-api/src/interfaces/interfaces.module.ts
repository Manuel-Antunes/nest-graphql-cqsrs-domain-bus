import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApplicationModule } from '../application/application.module';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { PostMutationResolver } from './graphql/post-mutation.resolver';
import { PostQueryResolver } from './graphql/post-query.resolver';
import { PostSubscriptionResolver } from './graphql/post-subscription.resolver';
import { PostTagsResolver } from './graphql/post-tags.resolver';
import { PostAuthorResolver } from './graphql/post-author.resolver';
import { UserQueryResolver } from './graphql/user-query.resolver';
import { AuthorPostsResolver } from './graphql/author-posts.resolver';
import { UserProvisioningHooks } from './auth/user-provisioning.hooks';
import { PostCompletionController } from './messaging/post-completion.controller';
import { UserViewInterceptor } from './interceptors/user-view.interceptor';
import { PostProfile } from './mapper/post.profile';
import { UserProfile } from './mapper/user.profile';
import { AuthorPipe } from './pipes/author.pipe';
import { SessionUserPipe } from './pipes/session-user.pipe';

@Module({
  imports: [ApplicationModule],
  controllers: [PostCompletionController],
  providers: [
    PostQueryResolver,
    PostMutationResolver,
    PostSubscriptionResolver,
    PostTagsResolver,
    PostAuthorResolver,
    UserQueryResolver,
    AuthorPostsResolver,
    PostProfile,
    UserProfile,
    UserViewInterceptor,
    SessionUserPipe,
    AuthorPipe,
    UserProvisioningHooks,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class InterfacesModule {}
