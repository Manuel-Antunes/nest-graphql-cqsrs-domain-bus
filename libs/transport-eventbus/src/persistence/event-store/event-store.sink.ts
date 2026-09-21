import { Injectable, Logger } from '@nestjs/common';
import { eventTagsOf } from '@nestposts/platform/domain/shared/event-type';
import { IngestionSink } from '../../inbound/ingestion-sink';
import { EventStore } from './event-store';

/**
 * **The sink of an event-sourced service: every event it ingests is appended to its stream.**
 *
 * There is nothing per-application about it — the stream an event belongs to is the aggregate the
 * event already names in its `@EventType({ tags })`, which is also what the routing key's last segment
 * is built from. A service that reacts to another's aggregate therefore binds this and stops thinking
 * about it: what arrives is remembered, in the ingestion's transaction, before anything reacts.
 *
 * An event with no tag has no stream to belong to, and this says so instead of guessing: it would be a
 * fact about an aggregate nobody can name, and appending it to one chosen here is how a replay comes
 * to disagree with the service that produced it.
 */
@Injectable()
export class EventStoreSink extends IngestionSink {
  private readonly logger = new Logger(EventStoreSink.name);

  constructor(private readonly store: EventStore) {
    super();
  }

  async receive(event: object): Promise<void> {
    const streamId = eventTagsOf(event)[0]?.value;
    if (!streamId) {
      this.logger.warn(
        `${event.constructor.name} arrived with no tag: there is no stream to append it to, so this ` +
          `service will only ever see it once, in memory`,
      );
      return;
    }
    await this.store.append(streamId, [event]);
  }
}
