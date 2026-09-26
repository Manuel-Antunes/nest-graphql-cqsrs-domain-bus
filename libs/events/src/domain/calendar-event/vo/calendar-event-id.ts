import { randomUUID } from 'node:crypto';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { CalendarEventIdSchema } from '../schemas/calendar-event-id.schema';

export class CalendarEventId extends ValidatedDto.Scalar(
  CalendarEventIdSchema,
) {
  static generate(): CalendarEventId {
    return CalendarEventId.parse(randomUUID());
  }
}
