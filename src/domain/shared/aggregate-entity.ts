import { BaseEntity } from '@mikro-orm/core';
import { WithAggregateRoot } from '@nestjs/cqrs';
import type { DomainEvent } from './domain-event';

/**
 * A base de toda entidade-raiz deste domínio: **uma classe só** que é ao mesmo tempo entidade do
 * MikroORM (`BaseEntity`) e aggregate root do @nestjs/cqrs (`WithAggregateRoot`).
 *
 * É exatamente o caso de uso do mixin `WithAggregateRoot`: a entidade já precisa herdar de algo (o
 * `BaseEntity` do ORM, que dá `toObject`/`assign`/`init`), então `extends AggregateRoot` não serve —
 * o mixin adiciona `apply`/`commit`/`getUncommittedEvents` a uma base que já existe.
 *
 * O contrato "decidir → evoluir" do Axon vira o par `apply(evento)` → `on<NomeDoEvento>(evento)`:
 * `apply` guarda o evento na lista de não-commitados **e** chama o handler `onXxx` que muda o estado.
 * `commit()` publica tudo no `EventBus` — mas só depois que a aplicação salvou a entidade.
 *
 * Uma constante compartilhada (e não um `WithAggregateRoot(...)` por entidade) de propósito: o MikroORM
 * descobre a classe-pai de cada entidade como entidade abstrata, e duas classes anônimas diferentes
 * com o mesmo nome `AggregateRoot` seriam ambíguas para ele.
 */
export const AggregateEntity = WithAggregateRoot<DomainEvent, typeof BaseEntity>(BaseEntity);
