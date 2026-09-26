import { z } from 'zod';

import { CalendarEventDetails } from '../vo/calendar-event-details';
import { CalendarEventId } from '../vo/calendar-event-id';
import { CalendarEventWindow } from '../vo/calendar-event-window';

export const CalendarEventSchema = z
  .object({
    id: CalendarEventId.field(),
    details: CalendarEventDetails.field(),
    window: CalendarEventWindow.field(),
    sequence: z.number().int().nonnegative(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine((state) => state.updatedAt >= state.createdAt, {
    error: 'updatedAt cannot precede createdAt',
    path: ['updatedAt'],
  });

export type ICalendarEvent = z.input<typeof CalendarEventSchema>;
