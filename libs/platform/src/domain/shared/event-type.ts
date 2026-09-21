import type { Type } from '@nestjs/common';
import { EventTypeConflictException, EventTypeMissingException } from './event-type.exception';

export interface EventTag {
  readonly key: string;
  readonly value: string;
}

export interface EventTypeOptions {
  readonly namespace: string;
  readonly name?: string;
  readonly version?: string;
  readonly tags?: readonly string[];
}

export interface EventTypeMetadata {
  readonly namespace: string;
  readonly name: string;
  readonly version: string;
  readonly qualifiedName: string;
  readonly messageType: string;
  readonly tags: readonly string[];
  readonly eventClass: Type<object>;
}

export const DEFAULT_EVENT_VERSION = '1.0.0';

const EVENT_TYPE = Symbol.for('nestposts.platform.event-type');

const byMessageType = new Map<string, EventTypeMetadata>();
const byQualifiedName = new Map<string, EventTypeMetadata>();

const localNameOf = (eventClass: Type<object>): string => eventClass.name.replace(/Event$/, '');

export const messageTypeOf = (qualifiedName: string, version: string): string =>
  `${qualifiedName}#${version}`;

export function EventType(options: EventTypeOptions): ClassDecorator {
  return (target) => {
    const eventClass = target as unknown as Type<object>;
    const name = options.name ?? localNameOf(eventClass);
    const version = options.version ?? DEFAULT_EVENT_VERSION;
    const qualifiedName = `${options.namespace}.${name}`;
    const metadata: EventTypeMetadata = {
      namespace: options.namespace,
      name,
      version,
      qualifiedName,
      messageType: messageTypeOf(qualifiedName, version),
      tags: options.tags ?? [],
      eventClass,
    };

    const clash = byQualifiedName.get(qualifiedName);
    if (clash && clash.eventClass !== eventClass) {
      throw new EventTypeConflictException(qualifiedName, clash.eventClass.name, eventClass.name);
    }

    Object.defineProperty(eventClass, EVENT_TYPE, {
      value: metadata,
      enumerable: false,
      configurable: true,
    });
    byQualifiedName.set(qualifiedName, metadata);
    byMessageType.set(metadata.messageType, metadata);
  };
}

export function eventTypeOf(event: object | Type<object>): EventTypeMetadata | undefined {
  const eventClass = typeof event === 'function' ? event : (event.constructor as Type<object>);
  return (eventClass as unknown as Record<symbol, EventTypeMetadata | undefined>)[EVENT_TYPE];
}

export function requireEventTypeOf(event: object | Type<object>): EventTypeMetadata {
  const metadata = eventTypeOf(event);
  if (!metadata) {
    const eventClass = typeof event === 'function' ? event : event.constructor;
    throw new EventTypeMissingException(eventClass.name);
  }
  return metadata;
}

export function eventTypeFor(messageType: string): EventTypeMetadata | undefined {
  return byMessageType.get(messageType) ?? byQualifiedName.get(qualifiedNameIn(messageType));
}

export function qualifiedNameIn(messageType: string): string {
  const separator = messageType.indexOf('#');
  return separator < 0 ? messageType : messageType.slice(0, separator);
}

export function namespaceIn(messageType: string): string {
  const qualifiedName = qualifiedNameIn(messageType);
  const separator = qualifiedName.lastIndexOf('.');
  return separator < 0 ? qualifiedName : qualifiedName.slice(0, separator);
}

export function eventTagsOf(event: object): EventTag[] {
  const metadata = eventTypeOf(event);
  if (!metadata) {
    return [];
  }
  const values = event as unknown as Record<string, unknown>;
  return metadata.tags
    .map((key) => ({ key, value: tagValueOf(values[key]) }))
    .filter((tag): tag is EventTag => tag.value !== undefined)
    .sort((one, other) => one.key.localeCompare(other.key) || one.value.localeCompare(other.value));
}

export function registeredEventTypes(): EventTypeMetadata[] {
  return [...byQualifiedName.values()];
}

function tagValueOf(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value);
}
