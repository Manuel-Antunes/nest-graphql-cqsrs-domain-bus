import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { CalendarEventWindowSchema } from '../schemas/calendar-event-window.schema';

export type CalendarEventWindowChanges = Partial<
  Pick<CalendarEventWindow, 'startDate' | 'endDate'>
>;

export class CalendarEventWindow extends ValidatedDto(
  CalendarEventWindowSchema,
) {
  static between(startDate: Date, endDate: Date): CalendarEventWindow {
    return CalendarEventWindow.parse({ startDate, endDate });
  }

  rescheduledTo(changes: CalendarEventWindowChanges): CalendarEventWindow {
    return CalendarEventWindow.between(
      changes.startDate ?? this.startDate,
      changes.endDate ?? this.endDate,
    );
  }
}
