import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um User passou a existir. É o **primeiro evento do stream**.
 *
 * ## `role` é um retrato, não um despacho
 * Ele registra o papel que o provedor de identidade tinha para essa pessoa no instante da criação —
 * como o `authorName` do `PostCreatedEvent`, é um fato gravado, e um fato não se reescreve.
 *
 * O que ele **não** é: a chave pela qual alguém escolhe a classe. Isso era o
 * `@EventSourced(concreteTypes = {Reader, Author})` do Axon, onde o framework inspecionava o primeiro
 * evento para instanciar o tipo certo. Aqui quem escolhe é quem chama — `Author.register(...)` devolve
 * um `Author` porque foi o `Author` que foi chamado —, e traduzir um papel do provedor em tipo de
 * domínio é trabalho do `UserProvisioning`, que conhece os dois lados.
 *
 * ## `supersedes`
 * Preenchido só quando este stream **nasce de uma promoção**: aponta para o `UserId` do stream que
 * foi encerrado para que este pudesse existir. Um `Reader` não vira `Author` no mesmo stream — ver
 * `User.supersede`.
 */
export class UserRegisteredEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
    readonly role: string | null,
    readonly supersedes: string | null,
    readonly occurredAt: Date,
  ) {}
}
