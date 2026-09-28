import { eventTypeOf } from '@nestposts/platform/domain/shared/event-type';

/**
 * **What a message is, on the wire and in the store** — Axon 5's `MessageType`: a qualified name,
 * `namespace.LocalName`, and a version. `posts.PostCreated#2.0.0`.
 *
 * Handlers and bindings match by the qualified name alone, never by the version and never by the
 * class: two versions of one event are the same event, told in two shapes.
 *
 * An event declares its type with `@EventType({ namespace, name, version })` (`@nestposts/platform`);
 * one that declares nothing is known by its class name, with no namespace and no version — and,
 * having no namespace, it never leaves the process.
 */
export class MessageType {
  constructor(
    readonly qualifiedName: string,
    readonly version?: string,
  ) {}

  /** The type `payload` declares, or its class name. */
  static of(payload: object): MessageType {
    const declared = eventTypeOf(payload);
    return declared
      ? new MessageType(declared.qualifiedName, declared.version)
      : new MessageType(payload.constructor.name);
  }

  /** `namespace.Name#version` back into a type; a string with no `#` has no version. */
  static parse(value: string): MessageType {
    const separator = value.indexOf('#');
    return separator < 0
      ? new MessageType(value)
      : new MessageType(value.slice(0, separator), value.slice(separator + 1));
  }

  /** Everything before the last `.` of the qualified name; empty for a type with none. */
  get namespace(): string {
    const separator = this.qualifiedName.lastIndexOf('.');
    return separator < 0 ? '' : this.qualifiedName.slice(0, separator);
  }

  /** Everything after the last `.`. */
  get localName(): string {
    const separator = this.qualifiedName.lastIndexOf('.');
    return separator < 0
      ? this.qualifiedName
      : this.qualifiedName.slice(separator + 1);
  }

  toString(): string {
    return this.version === undefined
      ? this.qualifiedName
      : `${this.qualifiedName}#${this.version}`;
  }
}
