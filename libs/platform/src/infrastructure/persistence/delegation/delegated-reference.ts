import { Reference } from '@mikro-orm/core';

import { BrokenDelegationException } from '../../../domain/shared/delegation/broken-delegation.exception';
import { delegationOf } from '../../../domain/shared/delegation/delegate';

function resolve(delegate: object): object {
  const delegation = delegationOf(delegate.constructor);
  if (!delegation) {
    throw BrokenDelegationException.notDelegated(
      delegate.constructor as new (...args: any[]) => object,
    );
  }
  return delegation.resolve(delegate);
}

function serve(member: string, descriptor: PropertyDescriptor): void {
  if (Object.getOwnPropertyDescriptor(Reference.prototype, member)) {
    return;
  }
  Object.defineProperty(Reference.prototype, member, {
    enumerable: false,
    configurable: true,
    ...descriptor,
  });
}

export function referencesServeDelegations(): void {
  serve('id', {
    get(this: Reference<object>) {
      const entity = this.unwrap() as { id?: unknown };
      return delegationOf(entity.constructor) ? entity.id : undefined;
    },
  });

  serve('delegated', {
    value(this: Reference<object>) {
      return resolve(this.getEntity());
    },
    writable: false,
  });

  serve('loadDelegated', {
    value: async function (this: Reference<object>) {
      await this.load();
      return this.isInitialized() ? resolve(this.unwrap()) : null;
    },
    writable: false,
  });
}
