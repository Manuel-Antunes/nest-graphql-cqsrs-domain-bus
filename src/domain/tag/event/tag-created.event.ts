import type { DomainEvent } from '../../shared/domain-event';

/** Evento de domínio: uma Tag passou a existir. Disparado por `Tag.create(...)`. */
export class TagCreatedEvent implements DomainEvent {
  constructor(
    readonly tagId: string,
    readonly name: string,
    readonly occurredAt: Date,
  ) {}
}
