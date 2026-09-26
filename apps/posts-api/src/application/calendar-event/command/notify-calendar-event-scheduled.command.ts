import { Inject, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { CalendarEventScheduledNotification } from '@nestposts/events/domain/calendar-event/notification/calendar-event-scheduled.notification';
import type { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import type { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { WebLinks } from '../../shared/web-links';

export namespace NotifyCalendarEventScheduledCommand {
  export class NotifyCalendarEventScheduled extends Command<void> {
    constructor(
      readonly calendarEventId: CalendarEventId,
      readonly details: CalendarEventDetails,
      readonly window: CalendarEventWindow,
      readonly responsibleId: UserId,
      readonly participantIds: readonly UserId[],
      readonly scheduledAt: Date,
    ) {
      super();
    }
  }

  @CommandHandler(NotifyCalendarEventScheduled, { scope: Scope.REQUEST })
  export class Handler
    implements ICommandHandler<NotifyCalendarEventScheduled>
  {
    private readonly logger = new Logger(NotifyCalendarEventScheduled.name);

    constructor(
      private readonly users: UserRepository,
      private readonly links: WebLinks,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    async execute(command: NotifyCalendarEventScheduled): Promise<void> {
      const responsible = await this.users.findById(command.responsibleId);
      if (!responsible) {
        this.logger.warn(
          `the responsible ${command.responsibleId} of calendar event ${command.calendarEventId} is gone — nobody to invite`,
        );
        return;
      }
      const participants = await this.existing(command.participantIds);
      for (const attendee of [responsible, ...participants]) {
        this.publisher.mergeObjectContext(attendee, this.request).notify(
          new CalendarEventScheduledNotification({
            event: {
              id: command.calendarEventId,
              details: command.details,
              window: command.window,
              sequence: 0,
            },
            responsible,
            participants,
            url: this.links.calendar(),
            issuedAt: command.scheduledAt,
          }),
          new Date(),
        );
        attendee.commit();
      }
    }

    private async existing(userIds: readonly UserId[]): Promise<User[]> {
      const users: User[] = [];
      for (const userId of userIds) {
        const user = await this.users.findById(userId);
        if (user) users.push(user);
      }
      return users;
    }
  }
}
