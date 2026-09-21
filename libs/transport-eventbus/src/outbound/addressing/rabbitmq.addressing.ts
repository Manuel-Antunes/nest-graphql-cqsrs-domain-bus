import { Injectable } from '@nestjs/common';
import { ClientProxy, ClientRMQ, Transport } from '@nestjs/microservices';
import { Addressing, type ChannelAddressing } from './channel-addressing';
import { TopicAddressing } from './topic.addressing';

/**
 * The {@link ChannelAddressing} for RabbitMQ.
 *
 * ## The routing key has THREE segments: `namespace.localName.orderingKey`
 * It is built by {@link TopicAddressing}, because more than one transport addresses that way. The
 * reason it looks like that belongs here: a topic exchange's routing key serves two things that pull against each other:
 * **selection** (who binds to what) and **ordering** (what lands on the same consumer). With the
 * first two segments coming from the message type, a consumer binds to `posts.PostCreated.*` and
 * receives only what it asked for. With the third coming from the aggregate's tag, the whole key
 * identifies the instance — and a consistent-hash exchange in front distributes by it, preserving
 * per-aggregate order.
 *
 * **Honest limit:** on a plain topic exchange, per-aggregate order only holds with one consumer per
 * queue. The third segment is what makes the alternative possible, not what already guarantees it.
 *
 * It is the qualified name, and not the local name: without the namespace in the value a binding on
 * `posts.*` does not match — the message goes out, the exchange drops it, and NOTHING in the log says
 * so.
 *
 * There is no `switch` over event types, and that is the point: a new event in the domain goes out
 * routed already, because the key is derived from metadata the event already carries.
 *
 * ## Adding Kafka
 * A sibling of this class, with `transport` returning `Transport.KAFKA`, `serves` testing for
 * `ClientKafka` and `pattern` returning the topic. It does NOT replace this one: the two live side by
 * side and the client of each destination picks between them.
 */
@Injectable()
@Addressing()
export class RabbitMqAddressing extends TopicAddressing {
  readonly transport = Transport.RMQ;

  serves(client: ClientProxy): boolean {
    return client instanceof ClientRMQ;
  }
}
