import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EVENTS_NAMESPACE } from './events.namespace';

@EventType({ namespace: EVENTS_NAMESPACE, tags: ['calendarEventId'] })
export class CalendarEventRescheduledEvent implements DomainEvent {
  constructor(
    readonly calendarEventId: string,
    readonly startDate: Date,
    readonly endDate: Date,
    readonly previousStartDate: Date,
    readonly previousEndDate: Date,
    readonly sequence: number,
    readonly occurredAt: Date,
  ) {}
}
