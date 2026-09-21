import { Module } from '@nestjs/common';
import { taggingInProcess } from '../infrastructure/transport/transport.config';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { IdentityModule } from '@nestposts/users/infrastructure/auth/identity.module';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';
import { AssignTagToPostCommand } from './post/command/assign-tag-to-post.command';
import { CreatePostCommand } from './post/command/create-post.command';
import { UpdatePostCommand } from './post/command/update-post.command';
import { CompletePostCommand } from './post/command/complete-post.command';
import { ProjectPostCompletion } from './post/projection/project-post-completion.projection';
import { InProcessTagAssignment } from './post/saga/in-process-tag-assignment.saga';
import { FindAllPostsQuery } from './post/query/find-all-posts.query';
import { FindPostQuery } from './post/query/find-post.query';
import { FindPostsByAuthorQuery } from './post/query/find-posts-by-author.query';
import { OnPostCreatedSubscription } from './post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from './post/subscription/on-post-updated.subscription';
import { CreateTagCommand } from './tag/command/create-tag.command';
import { FindAuthorQuery } from './user/query/find-author.query';
import { UserProvisioning } from './user/user-provisioning.service';

@Module({
  imports: [PostsInfrastructureModule, UsersInfrastructureModule, IdentityModule],
  providers: [
    CreatePostCommand.Handler,
    UpdatePostCommand.Handler,
    AssignTagToPostCommand.Handler,
    CompletePostCommand.Handler,
    CreateTagCommand.Handler,
    FindPostQuery.Handler,
    FindAllPostsQuery.Handler,
    FindPostsByAuthorQuery.Handler,
    FindAuthorQuery.Handler,
    ProjectPostCompletion,
    OnPostCreatedSubscription.Handler,
    OnPostUpdatedSubscription.Handler,
    UserProvisioning,
    ...(taggingInProcess() ? [InProcessTagAssignment] : []),
  ],
  exports: [UserProvisioning],
})
export class ApplicationModule {}
