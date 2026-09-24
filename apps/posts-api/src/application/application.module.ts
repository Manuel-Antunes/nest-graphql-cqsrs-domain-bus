import { Module } from '@nestjs/common';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { GeneratePresignedUrlQuery } from './asset/query/generate-presigned-url.query';
import { AssignTagToPostCommand } from './post/command/assign-tag-to-post.command';
import { CompletePostCommand } from './post/command/complete-post.command';
import { CreatePostCommand } from './post/command/create-post.command';
import { DeletePostCommand } from './post/command/delete-post.command';
import { UpdatePostCommand } from './post/command/update-post.command';
import { ProjectPostCompletion } from './post/projection/project-post-completion.projection';
import { FindAllPostsQuery } from './post/query/find-all-posts.query';
import { FindPostQuery } from './post/query/find-post.query';
import { FindPostsByAuthorQuery } from './post/query/find-posts-by-author.query';
import { OnPostCreatedSubscription } from './post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from './post/subscription/on-post-updated.subscription';
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
  ],
  providers: [
    GeneratePresignedUrlQuery.Handler,
    CreatePostCommand.Handler,
    UpdatePostCommand.Handler,
    DeletePostCommand.Handler,
    AssignTagToPostCommand.Handler,
    CompletePostCommand.Handler,
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
