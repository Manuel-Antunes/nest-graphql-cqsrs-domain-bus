import { eventTagsOf } from '@nestposts/platform/domain/shared/event-type';

import type { EventMessage } from '../messaging/event-message';

/**
 * **What an event is about** — Axon 5's `Tag`: a key and a value, `postId=9f1d…`. An event carries
 * as many as it is about, and a decision reads the events that carry the tags it cares for — which is
 * what the event store's consistency is built on, instead of one stream per aggregate.
 */
export class Tag {
  constructor(
    readonly key: string,
    readonly value: string,
  ) {}

  /** `key=value`, the form the store indexes and the wire carries. */
  toString(): string {
    return `${this.key}=${this.value}`;
  }

  equals(other: Tag): boolean {
    return this.key === other.key && this.value === other.value;
  }

  /** `key=value` back into a tag: the key ends at the first `=`. */
  static parse(value: string): Tag {
    const separator = value.indexOf('=');
    return separator < 0
      ? new Tag(value, '')
      : new Tag(value.slice(0, separator), value.slice(separator + 1));
  }
}

/**
 * **Which tags an event carries** — Axon 5's `TagResolver`. The default reads the properties
 * `@EventType({ tags })` names off the payload, which is Axon's `AnnotationBasedTagResolver` with the
 * declaration on the class instead of on each field.
 */
export abstract class TagResolver {
  abstract resolve(message: EventMessage): Tag[];
}

/** The tags `@EventType({ tags })` declares, read off the payload, sorted. */
export class AnnotationBasedTagResolver extends TagResolver {
  resolve(message: EventMessage): Tag[] {
    return eventTagsOf(message.payload).map(
      (tag) => new Tag(tag.key, tag.value),
    );
  }
}
