import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ApplicationModule } from '../application/application.module';
import { UserProvisioningHooks } from './auth/user-provisioning.hooks';
import { AuthExceptionFilter } from './filters/auth-exception.filter';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { HttpExceptionFilter } from './filters/http-exception.filter';
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
import { TagEntityResolver } from './graphql/tag-entity.resolver';
import { UserEntityResolver } from './graphql/user-entity.resolver';
import { UserQueryResolver } from './graphql/user-query.resolver';
import { UserViewInterceptor } from './interceptors/user-view.interceptor';
import { CalendarEventProfile } from './mapper/calendar-event.profile';
import { PostProfile } from './mapper/post.profile';
import { TeamProfile } from './mapper/team.profile';
import { UserProfile } from './mapper/user.profile';
import { PostCompletionController } from './messaging/post-completion.controller';
import { ActiveMemberPipe } from './pipes/active-member.pipe';
import { ActiveOrganizationPipe } from './pipes/active-organization.pipe';
import { ActiveOrganizationIdPipe } from './pipes/active-organization-id.pipe';
import { AuthorPipe } from './pipes/author.pipe';
import { SeesEveryEventPipe } from './pipes/sees-every-event.pipe';
import { SessionUserPipe } from './pipes/session-user.pipe';

@Module({
  imports: [ApplicationModule],
  controllers: [PostCompletionController],
  providers: [
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
    SessionUserPipe,
    SeesEveryEventPipe,
    AuthorPipe,
    ActiveOrganizationIdPipe,
    ActiveOrganizationPipe,
    ActiveMemberPipe,
    UserProvisioningHooks,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class InterfacesModule {}
