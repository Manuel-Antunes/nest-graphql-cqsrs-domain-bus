import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EVENTS_NAMESPACE } from './events.namespace';

@EventType({ namespace: EVENTS_NAMESPACE, tags: ['calendarEventId'] })
export class CalendarEventDeletedEvent implements DomainEvent {
  constructor(
    readonly calendarEventId: string,
    readonly occurredAt: Date,
  ) {}
}
