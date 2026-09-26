import { z } from 'zod';

export const CalendarEventIdSchema = z.uuid().brand<'CalendarEventId'>();
