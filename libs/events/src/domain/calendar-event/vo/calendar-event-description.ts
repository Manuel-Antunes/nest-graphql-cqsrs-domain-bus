import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { CalendarEventDescriptionSchema } from '../schemas/calendar-event-description.schema';

export class CalendarEventDescription extends ValidatedDto.Scalar(
  CalendarEventDescriptionSchema,
) {}
