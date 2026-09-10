import type { DomainEvent } from '../../shared/domain-event';

/** Evento de domínio: um User apagado voltou. Disparado por `user.restore(...)`; limpa o `deletedAt`. */
export class UserRestoredEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}
