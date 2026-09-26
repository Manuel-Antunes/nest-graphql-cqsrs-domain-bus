/**
 * Keeps two generations of the same attachment's variants from running at once —
 * `@jrmc/adonis-attachment`'s `verrou` lock. The default holds the lock in this process; a
 * deployment of several processes that can generate the same variant passes one that is shared, a
 * Postgres advisory lock say, as the module's `lock`.
 */
export abstract class AttachmentLock {
  abstract run<T>(key: string, work: () => Promise<T>): Promise<T>;
}

/** A lock per key, held in this process: whoever asks second runs once the first is done. */
export class InMemoryAttachmentLock extends AttachmentLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const current = (this.tails.get(key) ?? Promise.resolve()).then(work);
    const tail = current.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    return current;
  }
}
