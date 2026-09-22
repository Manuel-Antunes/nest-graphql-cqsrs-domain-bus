import { Logger } from '@nestjs/common';
import { ReplaySubject, firstValueFrom, throwError, timeout } from 'rxjs';

/** The application did not finish booting in time — see {@link bootOnce}. */
export class BootTimeoutError extends Error {
  constructor(readonly afterMs: number) {
    super(`the application was still booting after ${afterMs}ms`);
    this.name = BootTimeoutError.name;
  }
}

export interface BootOptions {
  /** How long an invocation waits for the boot before giving up. */
  readonly timeout?: number;
  /**
   * What to do when the boot itself fails. The default kills the process, and it is deliberate —
   * see below.
   */
  readonly onFailure?: (failure: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * **Boot the application once per container, at module load, and hand it to every invocation.**
 *
 * Module scope runs during the Lambda **init phase**, which happens before the first invocation is
 * handed over; a boot started inside the handler happens on the invocation's own clock instead. The
 * difference is the whole cold-start strategy of a Nest application on Lambda: an ORM connecting, a
 * GraphQL schema being built and a container being wired are not things to do while a caller waits.
 *
 * ## Why a subject and not a cached promise
 * Because there are three outcomes and a promise expresses two. A `ReplaySubject` replays the booted
 * application to every later invocation, propagates a boot **failure** to all of them, and — through
 * `timeout` per subscription — lets an invocation **give up** without cancelling the boot, which is
 * what the third outcome needs:
 *
 * ```ts
 * try {
 *   ({ instance } = await booted());
 * } catch (failure) {
 *   if (!(failure instanceof BootTimeoutError)) throw failure;
 *   // answer 503 with a retry-after, fast
 * }
 * ```
 *
 * **Waiting for the function's own timeout instead is the expensive mistake.** It bills the whole
 * timeout — often a hundred times the wait — and reports as a Lambda `Status: timeout`, which no
 * alarm on 5xx and no caller can see as anything other than silence.
 *
 * ## Why a boot failure exits the process
 * A container whose boot failed is poisoned: the subject is in its error state, and every invocation
 * routed there would fail identically, forever, while healthy containers serve beside it. Exiting
 * makes the runtime discard the sandbox, so the next invocation gets a fresh one and a transient
 * failure — a database that was not ready yet — costs one cold start instead of a permanently broken
 * container.
 */
export const bootOnce = <T>(
  bootstrap: () => Promise<T>,
  options: BootOptions = {},
): (() => Promise<T>) => {
  const logger = new Logger('bootstrap');
  const booted$ = new ReplaySubject<T>(1);
  const afterMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const onFailure =
    options.onFailure ??
    ((failure: unknown) => {
      logger.error(
        'the application could not be started; exiting so the runtime discards this container',
        failure instanceof Error ? failure.stack : String(failure),
      );
      process.exit(1);
    });

  bootstrap().then(
    (booted) => booted$.next(booted),
    (failure: unknown) => {
      booted$.error(failure);
      onFailure(failure);
    },
  );

  return () =>
    firstValueFrom(
      booted$.pipe(
        timeout({ first: afterMs, with: () => throwError(() => new BootTimeoutError(afterMs)) }),
      ),
    );
};
