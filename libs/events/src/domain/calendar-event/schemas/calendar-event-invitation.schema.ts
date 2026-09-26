import { z } from 'zod';

import { CalendarEventIdSchema } from './calendar-event-id.schema';
import { CalendarInviteeSchema } from './calendar-invitee.schema';

export const CalendarEventInvitationSchema = z.object({
  calendarEventId: CalendarEventIdSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
  sequence: z.number().int().nonnegative(),
  responsible: CalendarInviteeSchema,
  participants: z.array(CalendarInviteeSchema),
  url: z.url(),
  issuedAt: z.iso.datetime(),
});

export type CalendarEventInvitationData = z.infer<
  typeof CalendarEventInvitationSchema
>;

export const CalendarEventRescheduleSchema =
  CalendarEventInvitationSchema.extend({
    previousStartDate: z.iso.datetime(),
    previousEndDate: z.iso.datetime(),
  });

export type CalendarEventRescheduleData = z.infer<
  typeof CalendarEventRescheduleSchema
>;
