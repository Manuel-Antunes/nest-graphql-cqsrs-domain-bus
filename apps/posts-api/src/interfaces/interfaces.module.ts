import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AssetExceptionFilter } from '@nestposts/asset/filters/asset-exception.filter';
import { AuthExceptionFilter } from '@nestposts/auth/filters/auth-exception.filter';
import { HttpExceptionFilter } from '@nestposts/auth/filters/http-exception.filter';
import { IdentityUserPipe } from '@nestposts/auth/pipes/identity-user.pipe';
import { CalendarEventExceptionFilter } from '@nestposts/events/filters/calendar-event-exception.filter';
import { SeesEveryEventPipe } from '@nestposts/events/pipes/sees-every-event.pipe';
import { GraphQLResponseCacheModule } from '@nestposts/graphql-response-cache';
import { OrganizationsExceptionFilter } from '@nestposts/organizations/filters/organizations-exception.filter';
import { ActiveMemberPipe } from '@nestposts/organizations/pipes/active-member.pipe';
import { ActiveOrganizationPipe } from '@nestposts/organizations/pipes/active-organization.pipe';
import { ActiveOrganizationIdPipe } from '@nestposts/organizations/pipes/active-organization-id.pipe';
import { SoftDeleteExceptionFilter } from '@nestposts/platform/filters/soft-delete-exception.filter';
import { PostsExceptionFilter } from '@nestposts/posts/filters/posts-exception.filter';
import { UsersExceptionFilter } from '@nestposts/users/filters/users-exception.filter';
import { AuthorPipe } from '@nestposts/users/pipes/author.pipe';
import { ValidationExceptionFilter } from '@nestposts/validated-dto/filters/validation-exception.filter';

import { ApplicationModule } from '../application/application.module';
import { UserProvisioningHooks } from './auth/user-provisioning.hooks';
import { MapperExceptionFilter } from './filters/mapper-exception.filter';
import { AssetMutationResolver } from './graphql/asset-mutation.resolver';
import { AuthorEntityResolver } from './graphql/author-entity.resolver';
import { AuthorPostsResolver } from './graphql/author-posts.resolver';
import { CalendarEventMutationResolver } from './graphql/calendar-event-mutation.resolver';
import { CalendarEventQueryResolver } from './graphql/calendar-event-query.resolver';
import { OrganizationQueryResolver } from './graphql/organization-query.resolver';
import { PostAuthorResolver } from './graphql/post-author.resolver';
import { PostEntityResolver } from './graphql/post-entity.resolver';
import { PostMutationResolver } from './graphql/post-mutation.resolver';
import { PostQueryResolver } from './graphql/post-query.resolver';
import { PostSubscriptionResolver } from './graphql/post-subscription.resolver';
import { PostTagsResolver } from './graphql/post-tags.resolver';
import { ResponseCacheInvalidation } from './graphql/response-cache-invalidation.handler';
import { TagEntityResolver } from './graphql/tag-entity.resolver';
import { UserEntityResolver } from './graphql/user-entity.resolver';
import { UserQueryResolver } from './graphql/user-query.resolver';
import { UserViewInterceptor } from './interceptors/user-view.interceptor';
import { CalendarEventProfile } from './mapper/calendar-event.profile';
import { PostProfile } from './mapper/post.profile';
import { TeamProfile } from './mapper/team.profile';
import { UserProfile } from './mapper/user.profile';
import { PostCompletionController } from './messaging/post-completion.controller';

@Module({
  imports: [ApplicationModule, GraphQLResponseCacheModule],
  controllers: [PostCompletionController],
  providers: [
    ResponseCacheInvalidation,
    PostQueryResolver,
    PostMutationResolver,
    AssetMutationResolver,
    PostSubscriptionResolver,
    PostTagsResolver,
    PostAuthorResolver,
    UserQueryResolver,
    AuthorPostsResolver,
    PostEntityResolver,
    TagEntityResolver,
    UserEntityResolver,
    AuthorEntityResolver,
    CalendarEventQueryResolver,
    CalendarEventMutationResolver,
    OrganizationQueryResolver,
    PostProfile,
    UserProfile,
    TeamProfile,
    CalendarEventProfile,
    UserViewInterceptor,
    IdentityUserPipe,
    SeesEveryEventPipe,
    AuthorPipe,
    ActiveOrganizationIdPipe,
    ActiveOrganizationPipe,
    ActiveMemberPipe,
    UserProvisioningHooks,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
    { provide: APP_FILTER, useClass: UsersExceptionFilter },
    { provide: APP_FILTER, useClass: OrganizationsExceptionFilter },
    { provide: APP_FILTER, useClass: PostsExceptionFilter },
    { provide: APP_FILTER, useClass: CalendarEventExceptionFilter },
    { provide: APP_FILTER, useClass: SoftDeleteExceptionFilter },
    { provide: APP_FILTER, useClass: AssetExceptionFilter },
    { provide: APP_FILTER, useClass: ValidationExceptionFilter },
    { provide: APP_FILTER, useClass: MapperExceptionFilter },
  ],
})
export class InterfacesModule {}
