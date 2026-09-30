import type { Ref } from '@mikro-orm/core';
import { ref } from '@mikro-orm/core';
import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { ClientRegisteredEvent } from './event/client-registered.event';
import { ClientRemovedEvent } from './event/client-removed.event';
import { ClientRevisedEvent } from './event/client-revised.event';
import type { IClient } from './schemas/client.schema';
import { Address } from './vo/address';
import { ClientDetails } from './vo/client-details';
import { ClientId } from './vo/client-id';
import { ClientStatus } from './vo/client-status';

export type ClientDomainEvent =
  | ClientRegisteredEvent
  | ClientRevisedEvent
  | ClientRemovedEvent;

export interface ClientRevision {
  readonly details?: ClientDetails;
  readonly address?: Address;
  readonly status?: ClientStatus;
}

export class Client
  extends AggregateRoot(BaseEntity)<ClientDomainEvent>
  implements IClient
{
  id!: ClientId;

  details!: ClientDetails;

  address!: Address;

  status!: ClientStatus;

  createdBy: Ref<User> | null = null;

  get isActive(): boolean {
    return this.status.isActive;
  }

  static register(
    id: ClientId,
    details: ClientDetails,
    address: Address,
    createdBy: User | null,
    now: Date,
  ): Client {
    const client = new Client();
    client.apply(
      new ClientRegisteredEvent(
        id.value,
        details.snapshot(),
        address.snapshot(),
        ClientStatus.standard().value,
        createdBy?.id.value ?? null,
        now,
      ),
    );
    return client;
  }

  revise(revision: ClientRevision, now: Date): this {
    const details = revision.details ?? this.details;
    const address = revision.address ?? this.address;
    const status = revision.status ?? this.status;
    const unchanged =
      details.equals(this.details) &&
      address.equals(this.address) &&
      status.equals(this.status);
    if (unchanged) {
      return this;
    }
    this.apply(
      new ClientRevisedEvent(
        this.id.value,
        details.snapshot(),
        address.snapshot(),
        status.value,
        now,
      ),
    );
    return this;
  }

  remove(now: Date): this {
    this.apply(new ClientRemovedEvent(this.id.value, now));
    return this;
  }

  onClientRegisteredEvent(event: ClientRegisteredEvent): void {
    this.id = ClientId.parse(event.clientId);
    this.applyState(event);
    this.createdBy = event.createdById
      ? this.sameCreatorOr(event.createdById)
      : null;
    this.stampCreation(event.occurredAt);
  }

  onClientRevisedEvent(event: ClientRevisedEvent): void {
    this.applyState(event);
    this.touch(event.occurredAt);
  }

  onClientRemovedEvent(event: ClientRemovedEvent): void {
    this.touch(event.occurredAt);
  }

  private applyState(event: ClientRegisteredEvent | ClientRevisedEvent): void {
    this.details = ClientDetails.parse(event.details);
    this.address = Address.parse(event.address);
    this.status = ClientStatus.parse(event.status);
  }

  private sameCreatorOr(userId: string): Ref<User> {
    return this.createdBy?.id.equals(userId)
      ? this.createdBy
      : ref(User, UserId.parse(userId));
  }
}
