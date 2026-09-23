import { IAggregateRoot, WithAggregateRoot } from '@nestjs/cqrs';

import { BaseEntity } from './base-entity';
import { DomainEvent } from './domain-event';

export function AggregateRoot<
  TBase extends abstract new (...args: any[]) => BaseEntity,
>(Base: TBase) {
  const NewBase = WithAggregateRoot<DomainEvent, TBase>(Base) as abstract new (
    ...args: any[]
  ) => BaseEntity & IAggregateRoot<DomainEvent>;
  abstract class AggregateRoot<
    T extends DomainEvent = DomainEvent,
  > extends NewBase {
    override apply(
      event: T,
      options?: boolean | { fromHistory?: boolean; skipHandler?: boolean },
    ): void {
      super.apply(event, options as { fromHistory?: boolean });
      this.validate();
    }
  }
  return AggregateRoot as abstract new <T extends DomainEvent = DomainEvent>(
    ...args: any[]
  ) => IAggregateRoot<T> & InstanceType<TBase>;
}
