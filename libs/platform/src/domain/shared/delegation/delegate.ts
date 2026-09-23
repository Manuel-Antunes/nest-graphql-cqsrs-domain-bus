import type { Ref } from '@mikro-orm/core';
import type { Type } from '@nestjs/common';
import { ref, Reference, rel } from '@mikro-orm/core';

import { BrokenDelegationException } from './broken-delegation.exception';

declare const DELEGATED_TO: unique symbol;

export type Delegating<
  TSubject,
  TDelegate,
  TProperty extends string,
  TKey extends keyof TDelegate,
> = TSubject & Pick<TDelegate, TKey> & { readonly [K in TProperty]: TDelegate };

export type DelegatedRef<TDelegate extends object, TFinal> = Ref<TDelegate> & {
  readonly id: TFinal extends { id: infer TIdentity } ? TIdentity : never;
  delegated(): TFinal;
  loadDelegated(): Promise<TFinal | null>;
  readonly [DELEGATED_TO]?: TFinal;
};

export type SubjectKey<TDelegate, TSubject> = {
  [K in keyof TDelegate]: TDelegate[K] extends TSubject | Ref<TSubject>
    ? K
    : never;
}[keyof TDelegate];

export interface Delegation<TDelegate extends object = object> {
  readonly name: string;
  readonly delegate: Type<TDelegate>;
  readonly property: string;
  readonly subject: string;
  over(base: Type<object>): Type<object>;
  attach(target: object, delegate: TDelegate): void;
  resolve(delegate: TDelegate): object;
}

export interface DelegationOptions<
  TSubject extends object,
  TDelegate extends object,
  TProperty extends string,
  TKey extends keyof TDelegate,
> {
  readonly name: string;
  readonly to: Type<TDelegate>;
  readonly as: TProperty;
  readonly from: SubjectKey<TDelegate, TSubject> & string;
  readonly forwarding: readonly TKey[];
}

export interface DelegatingType<
  TSubject extends object,
  TDelegate extends object,
  TProperty extends string,
  TKey extends keyof TDelegate,
> extends Type<Delegating<TSubject, TDelegate, TProperty, TKey>> {
  readonly delegation: Delegation<TDelegate>;
  cast(
    subject: TSubject,
    delegate: TDelegate,
  ): Delegating<TSubject, TDelegate, TProperty, TKey>;
}

const delegations = new Map<Type<object>, Delegation<any>>();

export function delegationOf(delegate: unknown): Delegation<any> | undefined {
  return typeof delegate === 'function'
    ? delegations.get(delegate as Type<object>)
    : undefined;
}

function memberOf(
  delegate: Type<object>,
  key: PropertyKey,
): PropertyDescriptor {
  for (
    let target: object | null = delegate.prototype;
    target;
    target = Object.getPrototypeOf(target)
  ) {
    const found = Object.getOwnPropertyDescriptor(target, key);
    if (found) {
      return found;
    }
  }
  throw BrokenDelegationException.missingMember(delegate, key);
}

function forwarder(
  member: PropertyDescriptor,
  property: string,
  key: PropertyKey,
): PropertyDescriptor {
  if (member.get) {
    return {
      get(this: Record<string, any>) {
        return this[property][key];
      },
      enumerable: false,
      configurable: true,
    };
  }
  return {
    value(this: Record<string, any>, ...args: readonly unknown[]) {
      return this[property][key](...args);
    },
    enumerable: false,
    writable: false,
    configurable: true,
  };
}

export function Delegate<
  TSubject extends object,
  TDelegate extends object,
  TProperty extends string,
  TKey extends keyof TDelegate,
>(
  subject: Type<TSubject>,
  options: DelegationOptions<TSubject, TDelegate, TProperty, TKey>,
): DelegatingType<TSubject, TDelegate, TProperty, TKey> {
  const { name, to, as: property, from, forwarding } = options;
  const classes = new Map<Type<object>, Type<object>>();

  const attach = (target: object, delegate: TDelegate): void => {
    Object.defineProperty(target, property, {
      value: delegate,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  };

  const over = (base: Type<object>): Type<object> => {
    const built = classes.get(base);
    if (built) {
      return built;
    }
    const delegating = class extends (base as Type<any>) {};
    Object.defineProperty(delegating, 'name', {
      value: base === subject ? name : `${base.name}${name}`,
      configurable: true,
    });
    Object.defineProperty(delegating.prototype, 'constructor', {
      value: subject,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    for (const key of forwarding) {
      Object.defineProperty(
        delegating.prototype,
        key,
        forwarder(
          memberOf(to, key as PropertyKey),
          property,
          key as PropertyKey,
        ),
      );
    }
    classes.set(base, delegating);
    return delegating;
  };

  const cast = (target: TSubject, delegate: TDelegate) => {
    attach(target, delegate);
    Object.setPrototypeOf(target, root.prototype);
    return target as Delegating<TSubject, TDelegate, TProperty, TKey>;
  };

  const delegation: Delegation<TDelegate> = {
    name,
    delegate: to,
    property,
    subject: from,
    over,
    attach,
    resolve: (delegate) =>
      cast(Reference.unwrapReference((delegate as any)[from]), delegate),
  };

  const root = over(subject) as DelegatingType<
    TSubject,
    TDelegate,
    TProperty,
    TKey
  >;

  Object.defineProperties(root, {
    delegation: { value: delegation },
    cast: { value: cast },
  });

  if (delegations.has(to)) {
    throw BrokenDelegationException.alreadyDelegated(to);
  }
  delegations.set(to, delegation);

  return root;
}

export function delegateRef<
  TSubject extends object,
  TDelegate extends object,
  TProperty extends string,
  TKey extends keyof TDelegate,
>(
  delegating: DelegatingType<TSubject, TDelegate, TProperty, TKey>,
  source: TDelegate | Ref<TDelegate> | object,
): DelegatedRef<TDelegate, Delegating<TSubject, TDelegate, TProperty, TKey>> {
  const { delegate } = delegating.delegation;
  if (Reference.isReference(source)) {
    return source as never;
  }
  return (
    source instanceof delegate
      ? ref(source)
      : ref(rel(delegate, source as never))
  ) as never;
}
