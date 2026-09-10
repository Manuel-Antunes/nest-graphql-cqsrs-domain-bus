import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um User passou a existir. É o **primeiro evento do stream**, e é ele que decide
 * o tipo concreto — `role: 'author'` abre um `Author`, qualquer outra coisa abre um `Reader`.
 *
 * É o `@EventSourced(concreteTypes = {Reader, Author})` do Axon dito com o que temos: lá o framework
 * inspecionava o primeiro evento do stream para instanciar a classe certa; aqui quem faz isso é
 * `User.register` (ao decidir) e `User.fromHistory` (ao reconstituir). Os dois leem o mesmo campo,
 * então o que o command gravou e o que sai de um replay não podem divergir.
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
