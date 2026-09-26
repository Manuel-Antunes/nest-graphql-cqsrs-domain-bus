import { z } from 'zod';

export const CALENDAR_EVENT_TITLE_MAX_LENGTH = 200;

export const CalendarEventTitleSchema = z
  .string({ error: 'title must not be empty' })
  .trim()
  .min(1, 'title must not be empty')
  .max(
    CALENDAR_EVENT_TITLE_MAX_LENGTH,
    `title exceeds ${CALENDAR_EVENT_TITLE_MAX_LENGTH} characters`,
  )
  .brand<'CalendarEventTitle'>();
