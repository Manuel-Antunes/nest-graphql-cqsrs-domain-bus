import type { Cursor, FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { CalendarEvent } from '../../../domain/calendar-event/calendar-event.entity';
import type {
  CalendarPage,
  CalendarRange,
} from '../../../domain/calendar-event/calendar-event.repository';
import { CalendarEventRepository } from '../../../domain/calendar-event/calendar-event.repository';
import type { CalendarEventId } from '../../../domain/calendar-event/vo/calendar-event-id';

@Injectable()
export class MikroOrmCalendarEventRepository extends CalendarEventRepository {
  private static readonly RELATIONS = [
    'responsible',
    'participants',
    'team',
  ] as const;

  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(event: CalendarEvent): Promise<void> {
    await this.em.persist(event).flush();
  }

  async remove(event: CalendarEvent): Promise<void> {
    await this.em.remove(event).flush();
  }

  findById(id: CalendarEventId): Promise<CalendarEvent | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(
        CalendarEvent,
        { id },
        { populate: MikroOrmCalendarEventRepository.RELATIONS },
      ),
    );
  }

  findOverlapping(
    range: CalendarRange,
    page: CalendarPage,
  ): Promise<Cursor<CalendarEvent>> {
    return inRequestContext(this.em, () =>
      this.em.findByCursor(CalendarEvent, {
        where: MikroOrmCalendarEventRepository.overlapping(range),
        first: page.first,
        after: page.after ?? undefined,
        orderBy: { window: { startDate: 'asc' }, id: 'asc' },
        populate: MikroOrmCalendarEventRepository.RELATIONS,
      }),
    );
  }

  private static overlapping({
    from,
    to,
    teamId,
    attendee,
  }: CalendarRange): FilterQuery<CalendarEvent> {
    return {
      ...(to || from
        ? {
            window: {
              ...(to ? { startDate: { $lte: to } } : {}),
              ...(from ? { endDate: { $gte: from } } : {}),
            },
          }
        : {}),
      ...(teamId ? { team: teamId } : {}),
      ...(attendee
        ? {
            $or: [
              { responsible: attendee },
              { participants: { $some: { id: attendee } } },
            ],
          }
        : {}),
    } as FilterQuery<CalendarEvent>;
  }
}
