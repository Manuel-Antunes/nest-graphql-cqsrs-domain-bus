import { CalendarEventColor } from '@nestposts/events/domain/calendar-event/vo/calendar-event-color';
import { CalendarEventDescription } from '@nestposts/events/domain/calendar-event/vo/calendar-event-description';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventTitle } from '@nestposts/events/domain/calendar-event/vo/calendar-event-title';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import type { TeamView } from './team.view';
import type { IUserView } from './user.view';

const CalendarEventViewSchema = z.object({
  id: CalendarEventId.field(),
  title: CalendarEventTitle.field(),
  description: CalendarEventDescription.field().nullable(),
  startDate: z.date(),
  endDate: z.date(),
  color: CalendarEventColor.field(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

@InheritValidatedMetadata()
export class CalendarEventView extends ValidatedDto<
  typeof CalendarEventViewSchema,
  {
    responsible: IUserView;
    participants: IUserView[];
    team: TeamView | null;
  }
>(CalendarEventViewSchema) {}
