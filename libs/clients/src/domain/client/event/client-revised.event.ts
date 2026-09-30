import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import type { AddressInput } from '../schemas/address.schema';
import type { ClientDetailsInput } from '../schemas/client-details.schema';
import { CLIENTS_NAMESPACE } from './clients.namespace';

@EventType({ namespace: CLIENTS_NAMESPACE, tags: ['clientId'] })
export class ClientRevisedEvent implements DomainEvent {
  constructor(
    readonly clientId: string,
    readonly details: ClientDetailsInput,
    readonly address: AddressInput,
    readonly status: string,
    readonly occurredAt: Date,
  ) {}
}
