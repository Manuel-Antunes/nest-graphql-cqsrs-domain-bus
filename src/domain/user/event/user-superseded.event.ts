import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: este stream de User foi **encerrado** em favor de outro. Disparado por
 * `user.supersede(...)`, é o primeiro passo da promoção Reader → Author.
 *
 * Um usuário encerrado não some do banco e não perde nada: a linha continua lá, apontando para o
 * sucessor por `supersededBy`. O que ele perde é a participação no índice único de email — que é
 * parcial (`where superseded_by is null and deleted_at is null`) —, e é isso que permite o novo
 * stream nascer com o **mesmo email** sem colidir.
 */
export class UserSupersededEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly supersededBy: string,
    readonly occurredAt: Date,
  ) {}
}
