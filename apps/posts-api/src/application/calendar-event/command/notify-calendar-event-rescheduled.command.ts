import { Inject, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { CalendarEventRepository } from '@nestposts/events/domain/calendar-event/calendar-event.repository';
import { CalendarEventRescheduledNotification } from '@nestposts/events/domain/calendar-event/notification/calendar-event-rescheduled.notification';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import type { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';

import { WebLinks } from '../../shared/web-links';

export namespace NotifyCalendarEventRescheduledCommand {
  export class NotifyCalendarEventRescheduled extends Command<void> {
    constructor(
      readonly calendarEventId: CalendarEventId,
      readonly window: CalendarEventWindow,
      readonly previous: CalendarEventWindow,
      readonly sequence: number,
      readonly rescheduledAt: Date,
    ) {
      super();
    }
  }

  @CommandHandler(NotifyCalendarEventRescheduled, { scope: Scope.REQUEST })
  export class Handler
    implements ICommandHandler<NotifyCalendarEventRescheduled>
  {
    private readonly logger = new Logger(NotifyCalendarEventRescheduled.name);

    constructor(
      private readonly events: CalendarEventRepository,
      private readonly links: WebLinks,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    async execute(command: NotifyCalendarEventRescheduled): Promise<void> {
      const event = await this.events.findById(command.calendarEventId);
      if (!event) {
        this.logger.warn(
          `calendar event ${command.calendarEventId} is gone — nobody to tell it moved`,
        );
        return;
      }
      const responsible = event.responsible.getEntity();
      const participants = event.participants.getItems();
      for (const attendee of [responsible, ...participants]) {
        this.publisher.mergeObjectContext(attendee, this.request).notify(
          new CalendarEventRescheduledNotification(
            {
              event: {
                id: event.id,
                details: event.details,
                window: command.window,
                sequence: command.sequence,
              },
              responsible,
              participants,
              url: this.links.calendar(),
              issuedAt: command.rescheduledAt,
            },
            command.previous,
          ),
          new Date(),
        );
        attendee.commit();
      }
    }
  }
}
