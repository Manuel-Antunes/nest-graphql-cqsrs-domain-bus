import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { CalendarEventDetailsSchema } from '../schemas/calendar-event-details.schema';

export type CalendarEventDetailsChanges = Partial<
  Pick<CalendarEventDetails, 'title' | 'description' | 'color'>
>;

export class CalendarEventDetails extends ValidatedDto(
  CalendarEventDetailsSchema,
) {
  revisedWith(changes: CalendarEventDetailsChanges): CalendarEventDetails {
    return CalendarEventDetails.parse({
      title: changes.title ?? this.title,
      description:
        changes.description === undefined
          ? this.description
          : changes.description,
      color: changes.color ?? this.color,
    });
  }
}
