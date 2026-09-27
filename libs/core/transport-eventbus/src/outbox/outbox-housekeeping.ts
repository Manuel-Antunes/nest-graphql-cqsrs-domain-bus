import type {
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Duration, OutboxStats } from '@nestjs/outbox';
import { OutboxEvents, OutboxInbox, OutboxRelay } from '@nestjs/outbox';
import type { Subscription } from 'rxjs';

import { TRANSPORT_OUTBOX_SETTINGS } from '../constants';
import { EventOutbox } from './event-outbox';
import type { TransportOutboxSettings } from './transport-outbox.options';

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
 * - A `poll` process does it on a timer ({@link TransportOutboxSettings.housekeeping}), unreferenced
 *   so it never keeps a process alive.
 * - A function has no timer that survives it: a schedule invokes {@link sweep}, which also publishes
 *   what the units' own drains left behind — a retry's backoff, a crash between commit and publish.
 *
 * ## What is reported
 * The relay's counts when a due message has waited longer than
 * {@link TransportOutboxSettings.lagWarning} or when there are dead letters: `lagMs` grows while a
 * broker is down and `deadLetters` is what needs a person, and those are the two numbers to alert on.
 */
@Injectable()
export class OutboxHousekeeping
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxHousekeeping.name);
  private timer?: ReturnType<typeof setInterval>;
  private deadLetters?: Subscription;

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly relay: OutboxRelay,
    private readonly events: OutboxEvents,
    @Inject(TRANSPORT_OUTBOX_SETTINGS)
    private readonly settings: TransportOutboxSettings,
    @Optional() private readonly outbox?: EventOutbox,
  ) {}

  onModuleInit(): void {
    this.deadLetters = this.events.events$.subscribe((event) => {
      if (event.type === 'dead-lettered') {
        this.logger.error(
          `outbox gave up on ${event.message.topic} (${event.message.id}) after ${event.attempt} ` +
            `attempt(s), ${event.reason}: ${describe(event.error)}. It is a dead letter now: ` +
            'requeue it once whatever refused it is fixed.',
        );
      }
    });
  }

  onApplicationBootstrap(): void {
    if ((this.settings.relay ?? 'poll') !== 'poll') {
      return;
    }
    this.timer = setInterval(
      () => void this.tidy(),
      milliseconds(this.settings.housekeeping ?? '1h'),
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.deadLetters?.unsubscribe();
  }

  /** Publishes what is due, prunes the inbox and reports the outbox's health — what a schedule runs. */
  async sweep(): Promise<OutboxSweep> {
    await this.outbox?.drain();
    const pruned = await this.prune();
    return { pruned, stats: await this.health() };
  }

  /** Forgets what every consumer processed longer ago than the retention. */
  async prune(): Promise<number> {
    const pruned = await this.inbox.prune(
      this.settings.inboxRetention ?? '30d',
    );
    if (pruned > 0) {
      this.logger.log(`inbox pruned: ${pruned} message(s) forgotten`);
    }
    return pruned;
  }

  /** The relay's counts, reported when they need somebody's attention. */
  async health(): Promise<OutboxStats> {
    const stats = await this.relay.stats();
    const lagWarning = milliseconds(this.settings.lagWarning ?? '1m');
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
      if (this.outbox) {
        await this.health();
      }
    } catch (failure) {
      this.logger.error(
        'outbox housekeeping failed; it runs again at the next interval',
        failure instanceof Error ? failure.stack : String(failure),
      );
    }
  }
}

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** A {@link Duration} in milliseconds: a number already is, `'1h'` is 3,600,000. */
const milliseconds = (duration: Duration): number => {
  if (typeof duration === 'number') {
    return duration;
  }
  const [, amount, unit] = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(duration) ?? [
    undefined,
    undefined,
    undefined,
  ];
  if (amount === undefined || unit === undefined) {
    throw new TypeError(
      `'${duration}' is not a duration: write it as 30s, 5m, 1h or 30d`,
    );
  }
  return Math.round(Number(amount) * UNITS[unit]);
};

const describe = (failure: unknown): string =>
  failure instanceof Error
    ? `${failure.name}: ${failure.message}`
    : String(failure);
