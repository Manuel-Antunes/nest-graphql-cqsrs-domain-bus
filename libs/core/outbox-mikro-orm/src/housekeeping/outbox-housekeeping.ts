import type {
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Duration, OutboxStats } from '@nestjs/outbox';
import { OutboxEvents, OutboxInbox, OutboxRelay } from '@nestjs/outbox';
import type { Subscription } from 'rxjs';

import type { OutboxHousekeepingOptions } from './outbox-housekeeping.module-definition';
import { OUTBOX_HOUSEKEEPING_OPTIONS } from './outbox-housekeeping.module-definition';

/** What one {@link OutboxHousekeeping.sweep} did, and the outbox it left. */
export interface OutboxSweep {
  readonly pruned: number;
  readonly stats: OutboxStats;
}

/**
 * **What nothing in `@nestjs/outbox` does for you**, done here: the inbox is pruned, the outbox's
 * health is read and reported, and a message given up on is an error in the log rather than a
 * warning among the retries.
 *
 * - A long-lived process does it on a timer ({@link OutboxHousekeepingOptions.interval}),
 *   unreferenced so it never keeps a process alive.
 * - A function has no timer that survives it: a schedule invokes {@link sweep}, which also publishes
 *   what the units' own drains left behind — a retry's backoff, a crash between commit and publish.
 *
 * ## What is reported
 * The relay's counts when a due message has waited longer than
 * {@link OutboxHousekeepingOptions.lagWarning} or when there are dead letters: `lagMs` grows while a
 * broker is down and `deadLetters` is what needs a person, and those are the two numbers to alert on.
 *
 * It only speaks `@nestjs/outbox` — `OutboxInbox`, `OutboxRelay`, `OutboxEvents` — so it holds for
 * whichever store the application registered.
 */
@Injectable()
export class OutboxHousekeeping
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private static readonly MAX_PUBLISH_ROUNDS = 10;
  private static UNITS: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  private readonly logger = new Logger(OutboxHousekeeping.name);
  private timer?: ReturnType<typeof setInterval>;
  private deadLetters?: Subscription;

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly relay: OutboxRelay,
    private readonly events: OutboxEvents,
    @Inject(OUTBOX_HOUSEKEEPING_OPTIONS)
    private readonly options: OutboxHousekeepingOptions,
  ) {}

  onModuleInit(): void {
    this.deadLetters = this.events.events$.subscribe((event) => {
      if (event.type === 'dead-lettered') {
        this.logger.error(
          `outbox gave up on ${event.message.topic} (${event.message.id}) after ${event.attempt} ` +
            `attempt(s), ${event.reason}: ${this.describe(event.error)}. It is a dead letter now: ` +
            'requeue it once whatever refused it is fixed.',
        );
      }
    });
  }

  onApplicationBootstrap(): void {
    const interval = this.options.interval ?? '1h';
    if (interval === false) {
      return;
    }
    this.timer = setInterval(
      () => void this.tidy(),
      this.milliseconds(interval),
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.deadLetters?.unsubscribe();
  }

  /** Publishes what is due, prunes the inbox and reports the outbox's health — what a schedule runs. */
  async sweep(): Promise<OutboxSweep> {
    await this.publishDue();
    const pruned = await this.prune();
    return { pruned, stats: await this.health() };
  }

  /** Publishes what is due, a batch at a time, until a batch comes back short. */
  async publishDue(): Promise<void> {
    const batchSize = this.options.batchSize ?? 100;
    for (
      let round = 0;
      round < OutboxHousekeeping.MAX_PUBLISH_ROUNDS;
      round += 1
    ) {
      const { claimed } = await this.relay.runOnce();
      if (claimed < batchSize) {
        return;
      }
    }
  }

  /** Forgets what every consumer processed longer ago than the retention. */
  async prune(): Promise<number> {
    const pruned = await this.inbox.prune(this.options.inboxRetention ?? '30d');
    if (pruned > 0) {
      this.logger.log(`inbox pruned: ${pruned} message(s) forgotten`);
    }
    return pruned;
  }

  /** The relay's counts, reported when they need somebody's attention. */
  async health(): Promise<OutboxStats> {
    const stats = await this.relay.stats();
    const lagWarning = this.milliseconds(this.options.lagWarning ?? '1m');
    if (stats.lagMs > lagWarning || stats.deadLetters > 0) {
      this.logger.warn(
        `outbox needs attention: ${stats.deadLetters} dead letter(s), ${stats.pending} pending, ` +
          `${stats.ready} ready, ${stats.leased} leased, the oldest due message waiting ` +
          `${Math.round(stats.lagMs / 1000)}s`,
      );
    }
    return stats;
  }

  private async tidy(): Promise<void> {
    try {
      await this.prune();
      await this.health();
    } catch (failure) {
      this.logger.error(
        'outbox housekeeping failed; it runs again at the next interval',
        failure instanceof Error ? failure.stack : String(failure),
      );
    }
  }

  private milliseconds(duration: Duration): number {
    if (typeof duration === 'number') {
      return duration;
    }
    const [, amount, unit] = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(
      duration,
    ) ?? [undefined, undefined, undefined];
    if (amount === undefined || unit === undefined) {
      throw new TypeError(
        `'${duration}' is not a duration: write it as 30s, 5m, 1h or 30d`,
      );
    }
    return Math.round(Number(amount) * OutboxHousekeeping.UNITS[unit]);
  }

  private describe(failure: unknown): string {
    return failure instanceof Error
      ? `${failure.name}: ${failure.message}`
      : String(failure);
  }
}
