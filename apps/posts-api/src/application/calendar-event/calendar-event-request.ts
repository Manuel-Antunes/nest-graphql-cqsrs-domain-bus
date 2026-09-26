import { AsyncContext } from '@nestjs/cqrs';
import { ROOT_TENANT, TENANT_HEADER } from '@nestposts/database';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import type { ContextAttributes } from '@nestposts/transport-eventbus';

export class CalendarEventRequest
  extends AsyncContext
  implements ContextAttributes
{
  constructor(
    readonly calendarEventId: CalendarEventId,
    readonly tenantId: string = ROOT_TENANT,
  ) {
    super();
  }

  toAttributes(): Record<string, string> {
    return { [TENANT_HEADER]: this.tenantId };
  }
}
