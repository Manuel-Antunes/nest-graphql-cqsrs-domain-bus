import {
  BaseEntity as OrmBaseEntity,
  ReferenceKind,
  Utils,
  ref,
  rel,
} from "@mikro-orm/core";
import { WithTimestamps } from "./timestamps/timestamps";

export interface EntityIdentity {
  equals(other: unknown): boolean;
}

interface MappedProperty {
  name: string;
  kind?: ReferenceKind;
  ref?: boolean;
  targetMeta?: { class: new (...args: any[]) => object };
}

interface MappedEntity {
  __meta?: { props: MappedProperty[] };
}

const TO_ONE: ReadonlyArray<ReferenceKind> = [
  ReferenceKind.MANY_TO_ONE,
  ReferenceKind.ONE_TO_ONE,
];

const TO_MANY: ReadonlyArray<ReferenceKind> = [
  ReferenceKind.ONE_TO_MANY,
  ReferenceKind.MANY_TO_MANY,
];

function mappedProperties(entity: object): ReadonlyMap<string, MappedProperty> {
  const props = (entity as MappedEntity).__meta?.props ?? [];
  return new Map(props.map(prop => [prop.name, prop]));
}

function asRelation(prop: MappedProperty, value: unknown): unknown {
  const target = prop.targetMeta?.class;
  if (value == null || !target || Utils.isEntity(value, true)) {
    return value;
  }
  return prop.ref ? ref(target, value as never) : rel(target, value as never);
}

export abstract class BaseEntity<
  TState extends object = object,
> extends WithTimestamps(OrmBaseEntity) {
  abstract id: EntityIdentity;

  constructor(state?: TState) {
    super();
    if (!state) {
      return;
    }
    const props = mappedProperties(this);
    for (const [key, value] of Object.entries(state)) {
      const prop = props.get(key);
      if (prop?.kind !== undefined && TO_MANY.includes(prop.kind)) {
        continue;
      }
      (this as Record<string, unknown>)[key] =
        prop?.kind !== undefined && TO_ONE.includes(prop.kind)
          ? asRelation(prop, value)
          : value;
    }
  }

  validate(): void {}

  equals(other: unknown): boolean {
    return (
      other instanceof BaseEntity &&
      this.sameKindAs(other) &&
      this.id.equals(other.id)
    );
  }

  private sameKindAs(other: BaseEntity): boolean {
    return this instanceof other.constructor || other instanceof this.constructor;
  }
}
