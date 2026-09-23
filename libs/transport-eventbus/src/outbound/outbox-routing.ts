import type { Observable } from 'rxjs';
import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { defer, from, map } from 'rxjs';

import type { PublishedNamespaces } from '../decorators/publisher.decorator';
import type { ITransportPublisherEventBus } from '../interfaces/transport-publisher.interface';
import type { EventAddress } from './event-address';
import type { EventEnvelope } from './event-envelope';
import {
  EVERY_NAMESPACE,
  namespacesIn,
  Publisher,
  publisherNamespacesOf,
} from '../decorators/publisher.decorator';

/** A destination already resolved: what it is called, what it takes, and the client it sends on. */
export class Route {
  readonly namespaces: readonly string[];

  constructor(
    readonly declaration: string,
    namespaces: PublishedNamespaces,
    readonly client: ClientProxy,
    /** Upstream's path: a `@Publisher` class that implements `publish` sends its own messages. */
    private readonly publisher?: ITransportPublisherEventBus & {
      publish?: (event: object) => unknown;
    },
  ) {
    this.namespaces = namespacesIn(namespaces);
  }

  /** Whether this destination takes the events of that namespace — `''` being an event with no `@EventType`. */
  takes(namespace: string): boolean {
    return (
      this.namespaces.includes(EVERY_NAMESPACE) ||
      this.namespaces.includes(namespace)
    );
  }

  /**
   * The event on its way out, as a stream — which is what `ClientProxy.emit` already returns, and the
   * reason nothing here needs a promise: {@link EventForwarder} merges the destinations, and whoever
   * called `publish` decides once, at the edge, whether to await.
   */
  send(
    envelope: EventEnvelope<object>,
    address: EventAddress,
  ): Observable<void> {
    if (this.publisher?.publish) {
      return defer(() =>
        from(Promise.resolve(this.publisher?.publish?.(envelope.data))),
      ).pipe(map(() => undefined));
    }
    return this.client
      .emit(address.routingKey, envelope)
      .pipe(map(() => undefined));
  }
}

/**
 * **Which destination takes which event.** The routing table of the outbound half.
 *
 * ## The namespace is the rule, and it is one rule
 * A destination is a `@Publisher(namespace)` class holding a client; an event declares its namespace in
 * `@EventType({ namespace })`, because that is its identity on the wire — `posts.PostCreated#2.0.0`.
 * Matching the two is the whole selection.
 *
 * There is no second mechanism, and in particular the event does **not** name destinations: it already
 * says what it is, and a domain event that also said where it goes would be carrying a deployment
 * detail — the same fact written twice, in two places that then have to be kept in step. What a
 * service publishes is therefore read off the destinations it declares, and a new event in a namespace
 * already taken goes out routed with nothing added anywhere.
 *
 * ## What "no destination" means
 * An event whose namespace nothing takes stays in the process, which is the right default for the
 * events a domain is mostly made of — a `tags` event in a service that only publishes `posts` is not a
 * configuration mistake, it is an internal fact. An event with no `@EventType` has no namespace either,
 * so only an {@link EVERY_NAMESPACE} destination — upstream's mode — carries it.
 *
 * ## Two destinations, one namespace
 * That is fan-out, and it is legitimate: the same fact on a broker and on an audit bus. It is also how
 * one publishes twice by accident, so the table says so in its log — `describe()` is written out on the
 * first publish, which is the only honest place to notice it.
 *
 * ## The two things this refuses to do quietly
 * 1. **a `@Publisher` that names no namespace** — nothing would ever be routed to it: a client wired to
 *    a broker with nothing to publish is an oversight, not a configuration;
 * 2. **a `@Publisher` that exposes something other than a `ClientProxy`** — it would pass injection and
 *    only fail on the first event, far from the cause.
 *
 * Both bring the table's resolution down, naming the class.
 *
 * ## What it does not decide
 * The pattern. That is {@link EventAddress.routingKey}, read off the event, and a transport that
 * addresses differently says so in its own {@link EventEnvelopeSerializer} — the one place that
 * already knows the protocol.
 *
 * ## Why the table is resolved on the first publish, and not at startup
 * Because a client is a provider, and a provider resolved while this one is being constructed is a
 * provider resolved too early. By the first event, everything is up.
 */
@Injectable()
export class OutboxRouting {
  private readonly logger = new Logger(OutboxRouting.name);
  private table?: Route[];

  constructor(private readonly discovery: DiscoveryService) {}

  /** The destinations that take this event, read from the address the event itself carries. */
  routesFor(address: EventAddress): Route[] {
    return this.resolved().filter((route) => route.takes(address.namespace));
  }

  /** The table as it is, for a spec or a log line: `PostEventsPublisher ← [posts]`. */
  describe(): string[] {
    return this.resolved().map(
      (route) => `${route.declaration} ← [${route.namespaces.join(', ')}]`,
    );
  }

  private resolved(): Route[] {
    if (!this.table) {
      this.table = this.resolve();
      this.logger.log(
        `destinations: ${this.describe().join(', ') || '(none)'}`,
      );
      this.warnAboutOverlaps(this.table);
    }
    return this.table;
  }

  private resolve(): Route[] {
    return this.discovery
      .getProviders({ metadataKey: Publisher.KEY })
      .map((wrapper) => {
        const declaration =
          (wrapper.metatype as { name?: string } | undefined)?.name ??
          String(wrapper.name ?? 'a publisher');
        const namespaces =
          (this.discovery.getMetadataByDecorator(Publisher, wrapper) as
            PublishedNamespaces | undefined) ??
          publisherNamespacesOf(wrapper.instance as object);

        if (namespaces === undefined || namespacesIn(namespaces).length === 0) {
          throw new Error(
            `the @Publisher of ${declaration} names no namespace. A namespace is what an event's ` +
              `@EventType declares and what this destination is selected by; without one, nothing ` +
              `would ever be routed here. Name it, or take everything with EVERY_NAMESPACE.`,
          );
        }

        const client = (wrapper.instance as { client?: unknown } | undefined)
          ?.client;
        if (!(client instanceof ClientProxy)) {
          throw new Error(
            `the @Publisher of ${declaration} exposes ${describe(client)} as 'client', and not a ` +
              `ClientProxy. The decorator marks the client of a destination; there is nothing to ` +
              `publish on anything else.`,
          );
        }

        return new Route(
          declaration,
          namespaces,
          client,
          wrapper.instance as ITransportPublisherEventBus & {
            publish?: (event: object) => unknown;
          },
        );
      });
  }

  /**
   * Fan-out is legitimate — the same fact on a broker and on an audit bus — so this is a line in the
   * log and not a refusal. It is there because the other reason two destinations take one namespace is
   * that somebody declared the same thing twice, and then every event of it leaves twice while
   * everything still works.
   */
  private warnAboutOverlaps(table: readonly Route[]): void {
    const byNamespace = new Map<string, string[]>();
    for (const route of table) {
      for (const namespace of route.namespaces) {
        byNamespace.set(namespace, [
          ...(byNamespace.get(namespace) ?? []),
          route.declaration,
        ]);
      }
    }
    for (const [namespace, declarations] of byNamespace) {
      if (declarations.length > 1) {
        this.logger.warn(
          `${declarations.join(' and ')} both take '${namespace}': every event of it goes out ` +
            `through each of them. That is fan-out if it was meant, and a duplicate if it was not.`,
        );
      }
    }
  }
}

const describe = (client: unknown): string =>
  client === undefined || client === null
    ? 'nothing'
    : `a ${(client as object).constructor?.name ?? typeof client}`;
