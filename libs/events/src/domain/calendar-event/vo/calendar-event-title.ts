import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { CalendarEventTitleSchema } from '../schemas/calendar-event-title.schema';

export class CalendarEventTitle extends ValidatedDto.Scalar(
  CalendarEventTitleSchema,
) {}
