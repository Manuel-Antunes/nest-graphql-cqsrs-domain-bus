import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { CalendarEventRepository } from '@nestposts/events/domain/calendar-event/calendar-event.repository';
import { CalendarEventNotFoundException } from '@nestposts/events/domain/calendar-event/exception/calendar-event-not-found.exception';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';

import { CalendarEventRequest } from '../calendar-event-request';

export namespace DeleteCalendarEventCommand {
  export class DeleteCalendarEvent extends Command<void> {
    constructor(readonly calendarEventId: CalendarEventId) {
      super();
    }
  }

  @CommandHandler(DeleteCalendarEvent, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<DeleteCalendarEvent> {
    constructor(
      private readonly events: CalendarEventRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: CalendarEventRequest,
    ) {}

    async execute({ calendarEventId }: DeleteCalendarEvent): Promise<void> {
      const event = await this.events.findById(calendarEventId);
      if (!event) {
        throw new CalendarEventNotFoundException(calendarEventId);
      }
      this.publisher.mergeObjectContext(event, this.request).delete(new Date());
      await this.events.remove(event);
      event.commit();
    }
  }
}
