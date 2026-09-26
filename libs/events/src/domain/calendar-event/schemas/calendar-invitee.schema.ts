import { z } from 'zod';

export const CalendarInviteeSchema = z.object({
  name: z.string().min(1).nullable(),
  email: z.email(),
});

export type CalendarInvitee = z.infer<typeof CalendarInviteeSchema>;
