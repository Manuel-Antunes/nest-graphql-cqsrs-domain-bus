/**
 * **The key of a resource a processing context holds** — Axon 5's `Context.ResourceKey`.
 *
 * Two keys are the same key only when they are the same object: the label is for logs and nothing
 * else. So a component that wants a resource of its own declares its key once, as a static, and
 * nobody else can read or overwrite it by guessing a name.
 *
 * ```ts
 * static readonly QUEUE = new ResourceKey<EventMessage[]>('EventQueue');
 * const queue = context.computeResourceIfAbsent(Bus.QUEUE, () => []);
 * ```
 */
export class ResourceKey<T> {
  declare private readonly type?: T;

  constructor(readonly label: string) {}

  toString(): string {
    return `ResourceKey(${this.label})`;
  }
}
