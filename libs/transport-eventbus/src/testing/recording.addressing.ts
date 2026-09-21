import { Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { Addressing } from '../outbound/addressing/channel-addressing';
import { TopicAddressing } from '../outbound/addressing/topic.addressing';
import { RecordingClient } from './recording-client';

/**
 * The addressing of a {@link RecordingClient}: the same topic pattern the real transports get, so
 * what a spec reads back is the routing key the broker would have seen.
 *
 * It is a provider like any other, and it is declared by the spec that needs it — which is what keeps
 * a double from quietly answering for a client that should have had a real addressing.
 */
@Injectable()
@Addressing()
export class RecordingAddressing extends TopicAddressing {
  readonly transport = Symbol.for('nestposts.transport-eventbus.recording');

  serves(client: ClientProxy): boolean {
    return client instanceof RecordingClient;
  }
}
