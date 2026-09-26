import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EVENTS_NAMESPACE } from './events.namespace';

@EventType({ namespace: EVENTS_NAMESPACE, tags: ['calendarEventId'] })
export class CalendarEventCreatedEvent implements DomainEvent {
  constructor(
    readonly calendarEventId: string,
    readonly title: string,
    readonly description: string | null,
    readonly startDate: Date,
    readonly endDate: Date,
    readonly color: string,
    readonly responsibleId: string,
    readonly participantIds: readonly string[],
    readonly teamId: string | null,
    readonly occurredAt: Date,
  ) {}
}
