import { z } from 'zod';

export const CALENDAR_EVENT_COLORS = [
  'blue',
  'green',
  'red',
  'yellow',
  'purple',
  'orange',
  'gray',
] as const;

export const DEFAULT_CALENDAR_EVENT_COLOR = 'blue';

export const CALENDAR_EVENT_COLOR_MAX_LENGTH = 16;

export const CalendarEventColorSchema = z
  .string({ error: 'color must not be empty' })
  .trim()
  .toLowerCase()
  .pipe(
    z.enum(CALENDAR_EVENT_COLORS, {
      error: `color must be one of ${CALENDAR_EVENT_COLORS.join(', ')}`,
    }),
  )
  .brand<'CalendarEventColor'>();
