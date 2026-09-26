/**
 * Where variants are generated: in this process, after the transaction that stored their attachment
 * commits, `concurrency` at a time — `@jrmc/adonis-attachment`'s `DeferQueue`.
 *
 * {@link idle} is how a spec, a script or a short-lived process waits for what was queued before it
 * goes on — a Lambda that answers before its queue drains is frozen with the work half done.
 */
export class VariantQueue {
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly idlers: (() => void)[] = [];

  constructor(private readonly concurrency = 1) {}

  /** Runs `task` when a slot is free, and answers with its outcome. */
  push<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.next();
          });
      };
      if (this.running < this.concurrency) {
        run();
      } else {
        this.waiting.push(run);
      }
    });
  }

  /** Tasks running or waiting. */
  get size(): number {
    return this.running + this.waiting.length;
  }

  /** Resolves once nothing is running or waiting. */
  idle(): Promise<void> {
    if (this.size === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idlers.push(resolve));
  }

  private next(): void {
    const run = this.waiting.shift();
    if (run) {
      run();
      return;
    }
    if (this.running === 0) {
      for (const resolve of this.idlers.splice(0)) {
        resolve();
      }
    }
  }
}
