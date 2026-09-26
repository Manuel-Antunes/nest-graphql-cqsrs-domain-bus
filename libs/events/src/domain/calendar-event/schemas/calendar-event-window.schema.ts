import { z } from 'zod';

export const CalendarEventWindowSchema = z
  .object({
    startDate: z.date({ error: 'startDate must be a date' }),
    endDate: z.date({ error: 'endDate must be a date' }),
  })
  .refine((window) => window.endDate >= window.startDate, {
    error: 'endDate cannot precede startDate',
    path: ['endDate'],
  });
