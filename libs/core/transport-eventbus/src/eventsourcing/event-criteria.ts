import type { Tag } from './tag';

/** One alternative of a criteria: every one of these tags, and one of these types when any are given. */
export interface EventCriterion {
  readonly tags: readonly Tag[];
  readonly types: readonly string[];
}

/**
 * **Which events a decision depends on** — Axon 5's `EventCriteria`.
 *
 * ```ts
 * EventCriteria.havingTags(new Tag('postId', id))                       // one entity's events
 * EventCriteria.havingTags(course).andBeingOneOfTypes('StudentEnrolled') // the enrolments of a course
 *   .or(EventCriteria.havingTags(student))                               // …or anything about the student
 * EventCriteria.anyEvent()                                               // everything
 * ```
 *
 * An event matches a criterion when it carries **all** of its tags and, when the criterion names
 * types, is one of them; it matches the criteria when it matches any of its criteria.
 */
export class EventCriteria {
  private constructor(
    /** Empty means every event. */
    readonly criteria: readonly EventCriterion[],
  ) {}

  static anyEvent(): EventCriteria {
    return new EventCriteria([]);
  }

  static havingTags(...tags: Tag[]): EventCriteria {
    return new EventCriteria([{ tags, types: [] }]);
  }

  /** Every event of these types, whatever it is about. */
  static ofTypes(...types: string[]): EventCriteria {
    return new EventCriteria([{ tags: [], types }]);
  }

  /** Whether this matches every event. */
  get isAnyEvent(): boolean {
    return this.criteria.length === 0;
  }

  /** The same criteria, narrowed to these qualified names. */
  andBeingOneOfTypes(...types: string[]): EventCriteria {
    return this.isAnyEvent
      ? EventCriteria.ofTypes(...types)
      : new EventCriteria(
          this.criteria.map((criterion) => ({ ...criterion, types })),
        );
  }

  /** Either this or that. */
  or(other: EventCriteria): EventCriteria {
    return this.isAnyEvent || other.isAnyEvent
      ? EventCriteria.anyEvent()
      : new EventCriteria([...this.criteria, ...other.criteria]);
  }

  matches(qualifiedName: string, tags: readonly Tag[]): boolean {
    return (
      this.isAnyEvent ||
      this.criteria.some(
        (criterion) =>
          criterion.tags.every((wanted) =>
            tags.some((tag) => tag.equals(wanted)),
          ) &&
          (criterion.types.length === 0 ||
            criterion.types.includes(qualifiedName)),
      )
    );
  }

  /** Every tag any criterion names — what a store locks before it checks a condition. */
  get tags(): Tag[] {
    return this.criteria.flatMap((criterion) => [...criterion.tags]);
  }
}
