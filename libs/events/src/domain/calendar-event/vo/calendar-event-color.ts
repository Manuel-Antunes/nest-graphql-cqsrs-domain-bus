import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import {
  CalendarEventColorSchema,
  DEFAULT_CALENDAR_EVENT_COLOR,
} from '../schemas/calendar-event-color.schema';

export class CalendarEventColor extends ValidatedDto.Scalar(
  CalendarEventColorSchema,
) {
  static standard(): CalendarEventColor {
    return CalendarEventColor.parse(DEFAULT_CALENDAR_EVENT_COLOR);
  }
}
