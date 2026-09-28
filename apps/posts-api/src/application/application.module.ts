import { Module } from '@nestjs/common';
import { EventsInfrastructureModule } from '@nestposts/events/infrastructure/events-infrastructure.module';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';
import { GeneratePresignedUrlQuery } from './asset/query/generate-presigned-url.query';
import { CalendarAttendees } from './calendar-event/calendar-attendees.service';
import { CreateCalendarEventCommand } from './calendar-event/command/create-calendar-event.command';
import { DeleteCalendarEventCommand } from './calendar-event/command/delete-calendar-event.command';
import { NotifyCalendarEventRescheduledCommand } from './calendar-event/command/notify-calendar-event-rescheduled.command';
import { NotifyCalendarEventScheduledCommand } from './calendar-event/command/notify-calendar-event-scheduled.command';
import { UpdateCalendarEventCommand } from './calendar-event/command/update-calendar-event.command';
import { FindCalendarEventQuery } from './calendar-event/query/find-calendar-event.query';
import { FindCalendarEventsQuery } from './calendar-event/query/find-calendar-events.query';
import { NotifyAttendeesOnCalendarEvent } from './calendar-event/saga/notify-attendees-on-calendar-event.saga';
import { FindMembersQuery } from './organization/query/find-members.query';
import { FindTeamsQuery } from './organization/query/find-teams.query';
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

@Module({
  imports: [
    PostsInfrastructureModule,
    UsersInfrastructureModule,
    OrganizationsInfrastructureModule,
    EventsInfrastructureModule,
  ],
  providers: [
    {
      provide: WebLinks,
      inject: [appConfig.KEY],
      useFactory: ({ webUrl }: AppConfig) => new WebLinks(webUrl),
    },
    GeneratePresignedUrlQuery.Handler,
    CreatePostCommand.Handler,
    UpdatePostCommand.Handler,
    DeletePostCommand.Handler,
    AssignTagToPostCommand.Handler,
    CompletePostCommand.Handler,
    NotifyPostCreatedCommand.Handler,
    NotifyAuthorOnPostCreated,
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
    FindMembersQuery.Handler,
    FindTeamsQuery.Handler,
    CalendarAttendees,
    CreateCalendarEventCommand.Handler,
    UpdateCalendarEventCommand.Handler,
    DeleteCalendarEventCommand.Handler,
    NotifyCalendarEventScheduledCommand.Handler,
    NotifyCalendarEventRescheduledCommand.Handler,
    NotifyAttendeesOnCalendarEvent,
    FindCalendarEventQuery.Handler,
    FindCalendarEventsQuery.Handler,
  ],
  exports: [UsersInfrastructureModule, OrganizationsInfrastructureModule],
})
export class ApplicationModule {}
