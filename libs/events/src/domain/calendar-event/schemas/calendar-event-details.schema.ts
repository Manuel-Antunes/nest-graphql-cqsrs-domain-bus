import { z } from 'zod';

import { CalendarEventColor } from '../vo/calendar-event-color';
import { CalendarEventDescription } from '../vo/calendar-event-description';
import { CalendarEventTitle } from '../vo/calendar-event-title';

export const CalendarEventDetailsSchema = z.object({
  title: CalendarEventTitle.field(),
  description: CalendarEventDescription.field()
    .nullish()
    .transform((description) => description ?? null),
  color: CalendarEventColor.field()
    .nullish()
    .transform((color) => color ?? CalendarEventColor.standard()),
});
