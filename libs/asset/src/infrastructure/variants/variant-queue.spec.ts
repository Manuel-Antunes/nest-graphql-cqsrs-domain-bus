import { InMemoryAttachmentLock } from '../locking/attachment-lock';
import { VariantQueue } from './variant-queue';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('VariantQueue', () => {
  it('runs no more tasks at once than its concurrency, and is idle once they are done', async () => {
    const queue = new VariantQueue(2);
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;

    const tasks = gates.map((gate) =>
      queue.push(async () => {
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
      }),
    );
    const idle = queue.idle();
    expect(queue.size).toBe(3);

    for (const gate of gates) gate.resolve();
    await Promise.all(tasks);
    await idle;

    expect(peak).toBe(2);
    expect(queue.size).toBe(0);
  });

  it('answers each push with its own task’s outcome', async () => {
    const queue = new VariantQueue();

    await expect(queue.push(async () => 42)).resolves.toBe(42);
    await expect(
      queue.push(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(queue.idle()).resolves.toBeUndefined();
  });
});

describe('InMemoryAttachmentLock', () => {
  it('runs work under one key one at a time, and under different keys side by side', async () => {
    const lock = new InMemoryAttachmentLock();
    const order: string[] = [];
    const gate = deferred();

    const first = lock.run('a', async () => {
      order.push('a1 start');
      await gate.promise;
      order.push('a1 end');
    });
    const second = lock.run('a', async () => {
      order.push('a2');
    });
    const other = lock.run('b', async () => {
      order.push('b');
    });

    await other;
    gate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['a1 start', 'b', 'a1 end', 'a2']);
  });

  it('lets the next one run after a failure', async () => {
    const lock = new InMemoryAttachmentLock();

    await expect(
      lock.run('k', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(lock.run('k', async () => 'next')).resolves.toBe('next');
  });
});
