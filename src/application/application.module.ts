import { Module } from '@nestjs/common';
import { IdentityModule } from '../infrastructure/auth/identity.module';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { AssignTagToPostCommand } from './post/command/assign-tag-to-post.command';
import { CreatePostCommand } from './post/command/create-post.command';
import { UpdatePostCommand } from './post/command/update-post.command';
import { AssignDefaultTagOnPostCreated } from './post/event/assign-default-tag-on-post-created.saga';
import { FindAllPostsQuery } from './post/query/find-all-posts.query';
import { FindPostQuery } from './post/query/find-post.query';
import { FindPostsByAuthorQuery } from './post/query/find-posts-by-author.query';
import { OnPostCreatedSubscription } from './post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from './post/subscription/on-post-updated.subscription';
import { CreateTagCommand } from './tag/command/create-tag.command';
import { FindAuthorQuery } from './user/query/find-author.query';
import { UserProvisioning } from './user/user-provisioning.service';

@Module({
  imports: [PersistenceModule, IdentityModule],
  providers: [
    CreatePostCommand.Handler,
    UpdatePostCommand.Handler,
    AssignTagToPostCommand.Handler,
    CreateTagCommand.Handler,
    FindPostQuery.Handler,
    FindAllPostsQuery.Handler,
    FindPostsByAuthorQuery.Handler,
    FindAuthorQuery.Handler,
    OnPostCreatedSubscription.Handler,
    OnPostUpdatedSubscription.Handler,
    AssignDefaultTagOnPostCreated,
    UserProvisioning,
  ],
  exports: [UserProvisioning],
})
export class ApplicationModule {}
