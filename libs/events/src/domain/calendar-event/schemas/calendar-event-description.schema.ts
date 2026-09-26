import { z } from 'zod';

export const CalendarEventDescriptionSchema = z
  .string({ error: 'description must not be empty' })
  .trim()
  .min(1, 'description must not be empty')
  .brand<'CalendarEventDescription'>();
