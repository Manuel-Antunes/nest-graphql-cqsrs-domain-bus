import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { CLIENTS_NAMESPACE } from './clients.namespace';

@EventType({ namespace: CLIENTS_NAMESPACE, tags: ['clientId'] })
export class ClientRemovedEvent implements DomainEvent {
  constructor(
    readonly clientId: string,
    readonly occurredAt: Date,
  ) {}
}
