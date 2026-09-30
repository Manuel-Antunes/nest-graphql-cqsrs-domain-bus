import {
  defineEntity,
  p,
  TENANT_SCHEMA,
  valueObjectType,
} from '@nestposts/database';
import { TeamEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/team-orm.entity';
import { ZodEntity } from '@nestposts/platform/domain/shared/zod-entity';
import { UserEntitySchema } from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { CalendarEvent } from '../../../domain/calendar-event/calendar-event.entity';
import { InvalidCalendarEventException } from '../../../domain/calendar-event/exception/invalid-calendar-event.exception';
import { CalendarEventSchema } from '../../../domain/calendar-event/schemas/calendar-event.schema';
import { CALENDAR_EVENT_COLOR_MAX_LENGTH } from '../../../domain/calendar-event/schemas/calendar-event-color.schema';
import { CALENDAR_EVENT_TITLE_MAX_LENGTH } from '../../../domain/calendar-event/schemas/calendar-event-title.schema';
import { CalendarEventColor } from '../../../domain/calendar-event/vo/calendar-event-color';
import { CalendarEventDescription } from '../../../domain/calendar-event/vo/calendar-event-description';
import { CalendarEventDetails } from '../../../domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '../../../domain/calendar-event/vo/calendar-event-id';
import { CalendarEventTitle } from '../../../domain/calendar-event/vo/calendar-event-title';
import { CalendarEventWindow } from '../../../domain/calendar-event/vo/calendar-event-window';

export const CalendarEventDetailsEntitySchema = defineEntity({
  class: CalendarEventDetails,
  embeddable: true,
  properties: {
    title: p.type(
      valueObjectType(CalendarEventTitle, {
        columnType: `varchar(${CALENDAR_EVENT_TITLE_MAX_LENGTH})`,
      }),
    ),
    description: p
      .type(valueObjectType(CalendarEventDescription, { columnType: 'text' }))
      .nullable(),
    color: p.type(
      valueObjectType(CalendarEventColor, {
        columnType: `varchar(${CALENDAR_EVENT_COLOR_MAX_LENGTH})`,
      }),
    ),
  },
});

export const CalendarEventWindowEntitySchema = defineEntity({
  class: CalendarEventWindow,
  embeddable: true,
  properties: {
    startDate: p.datetime(),
    endDate: p.datetime(),
  },
});

export const CalendarEventEntitySchema = defineEntity({
  class: CalendarEvent,
  tableName: 'calendar_events',
  schema: TENANT_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(valueObjectType(CalendarEventId, { columnType: 'varchar(36)' }))
      .primary(),
    details: () =>
      p.embedded(CalendarEventDetailsEntitySchema).prefix(false).object(false),
    window: () =>
      p.embedded(CalendarEventWindowEntitySchema).prefix(false).object(false),
    responsible: () => p.manyToOne(UserEntitySchema).ref(),
    participants: () => p.manyToMany(UserEntitySchema).owner(),
    team: () =>
      p.manyToOne(TeamEntitySchema).ref().nullable().deleteRule('set null'),
    sequence: p.integer().default(0),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
  indexes: [
    { properties: ['window.startDate', 'id'] } as { properties: never },
  ],
});

ZodEntity(
  CalendarEvent,
  CalendarEventSchema,
  (error) =>
    new InvalidCalendarEventException('invalid calendar event', {
      cause: error,
    }),
);
