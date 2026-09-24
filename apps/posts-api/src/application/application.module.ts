import { Module } from '@nestjs/common';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { GeneratePresignedUrlQuery } from './asset/query/generate-presigned-url.query';
import { MarkNotificationAsReadCommand } from './notification/command/mark-notification-as-read.command';
import { RegisterDeviceCommand } from './notification/command/register-device.command';
import { RemoveDeviceCommand } from './notification/command/remove-device.command';
import { FindDeviceQuery } from './notification/query/find-device.query';
import { FindNotificationQuery } from './notification/query/find-notification.query';
import { FindNotificationsQuery } from './notification/query/find-notifications.query';
import { AssignTagToPostCommand } from './post/command/assign-tag-to-post.command';
import { CompletePostCommand } from './post/command/complete-post.command';
import { CreatePostCommand } from './post/command/create-post.command';
import { DeletePostCommand } from './post/command/delete-post.command';
import { NotifyPostCreatedCommand } from './post/command/notify-post-created.command';
import { UpdatePostCommand } from './post/command/update-post.command';
import { ProjectPostCompletion } from './post/projection/project-post-completion.projection';
import { FindAllPostsQuery } from './post/query/find-all-posts.query';
import { FindPostQuery } from './post/query/find-post.query';
import { FindPostsByAuthorQuery } from './post/query/find-posts-by-author.query';
import { NotifyAuthorOnPostCreated } from './post/saga/notify-author-on-post-created.saga';
import { OnPostCreatedSubscription } from './post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from './post/subscription/on-post-updated.subscription';
import { WebLinks } from './shared/web-links';
import { CreateTagCommand } from './tag/command/create-tag.command';
import { FindTagQuery } from './tag/query/find-tag.query';
import { FindAuthorQuery } from './user/query/find-author.query';
import { FindUserQuery } from './user/query/find-user.query';
import { UserProvisioning } from './user/user-provisioning.service';

@Module({
  imports: [
    PostsInfrastructureModule,
    UsersInfrastructureModule,
    OrganizationsInfrastructureModule,
    NotificationsInfrastructureModule,
  ],
  providers: [
    { provide: WebLinks, useFactory: () => WebLinks.fromEnv() },
    GeneratePresignedUrlQuery.Handler,
    CreatePostCommand.Handler,
    UpdatePostCommand.Handler,
    DeletePostCommand.Handler,
    AssignTagToPostCommand.Handler,
    CompletePostCommand.Handler,
    NotifyPostCreatedCommand.Handler,
    NotifyAuthorOnPostCreated,
    MarkNotificationAsReadCommand.Handler,
    RegisterDeviceCommand.Handler,
    RemoveDeviceCommand.Handler,
    FindNotificationsQuery.Handler,
    FindNotificationQuery.Handler,
    FindDeviceQuery.Handler,
    CreateTagCommand.Handler,
    FindPostQuery.Handler,
    FindAllPostsQuery.Handler,
    FindPostsByAuthorQuery.Handler,
    FindTagQuery.Handler,
    FindAuthorQuery.Handler,
    FindUserQuery.Handler,
    ProjectPostCompletion,
    OnPostCreatedSubscription.Handler,
    OnPostUpdatedSubscription.Handler,
    UserProvisioning,
  ],
  exports: [UserProvisioning, OrganizationsInfrastructureModule],
})
export class ApplicationModule {}
