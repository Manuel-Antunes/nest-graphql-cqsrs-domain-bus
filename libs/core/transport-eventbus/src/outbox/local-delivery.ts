import type { Type } from '@nestjs/common';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import type { OutboxHandlerContext } from '@nestjs/outbox';
import { OnOutboxMessage, OutboxInbox } from '@nestjs/outbox';
import {
  RequestContext,
  ROOT_TENANT,
  TenantEntityManagerService,
} from '@nestposts/database';
import { registeredEventTypes } from '@nestposts/platform/domain/shared/event-type';

import { TRANSPORT_OUTBOX_SETTINGS } from '../constants';
import {
  envelopeOf,
  messageOf,
  restore,
} from '../inbound/event-reconstruction';
import { InboxDescriptions } from '../inbound/inbox-descriptions';
import { TransportTenantResolver } from '../inbound/transport-tenant.resolver';
import type { Ingestion } from '../outbound/transport-metadata';
import { RequestContextCodec } from '../request-context';
import { ingesting } from '../tracing';
import { TransportIdentity } from '../transport-identity';
import {
  UnitOfWork,
  UnitOfWorkTransaction,
} from '../unit-of-work/unit-of-work';
import type { TransportOutboxSettings } from './transport-outbox.options';

/**
 * **The receiving end of the outbox's `local` transport — where `@nestjs/outbox` hands an event to
 * `@nestjs/cqrs`.**
 *
 * An event whose namespace the outbox has no transport for ({@link OutboxRoute}) — every event of a
 * service running with no broker — is not told to this process at its unit of work's commit. It is
 * written to the outbox like any event that leaves, and the relay delivers it `local`, here: the
 * event is restored as the real class, under the identifier it was raised with and **without** the
 * ingestion mark — it is this service's own decision — and published on this process's `EventBus`,
 * with the request its headers carry. The handlers, the sagas and whatever they dispatch run then,
 * and what they gain is what the outbox gives a message: it is delivered after the commit and until
 * it is taken, retried and dead-lettered like any other.
 *
 * ## One delivery, one unit of work, in the tenant the message names
 * The same shape as an ingestion: the inbox row — under this service's name, which is what makes the
 * relay's redelivery harmless — and everything the handlers write and stage commit together, or roll
 * back together, and a handler that fails fails the delivery. What it does NOT do is append to the
 * event log, which the unit that raised the event already did, or check the origin mark, which would
 * drop every message here as this service's own echo.
 *
 * The relay delivers outside any request, and outside Nest's enhancers: nothing has opened the
 * tenant the event belongs to, the way `TenantInterceptor` does for a controller. So it opens it
 * itself, from the request the headers restore, when the application runs `TenancyModule`.
 *
 * ## An `@OnOutboxMessage()` the module declares
 * The `local` transport is the outbox's dispatcher, and it delivers only to `@OnOutboxMessage()`
 * handlers, matched by exact topic — the event's qualified name. `TransportEventBusModule` declares
 * this one for every event of the namespaces the service publishes ({@link of}), so the application
 * writes none; `inbox: false` because the inbox is written here, in the unit's transaction.
 */
@Injectable()
export class LocalDelivery {
  /** The name the outbox's dispatcher knows this handler by. The inbox rows are under the service's name. */
  static readonly CONSUMER = 'transport-eventbus';

  private readonly logger = new Logger(LocalDelivery.name);

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly transaction: UnitOfWorkTransaction,
    private readonly context: RequestContextCodec,
    private readonly eventBus: EventBus,
    private readonly identity: TransportIdentity,
    @Inject(TRANSPORT_OUTBOX_SETTINGS)
    private readonly settings: TransportOutboxSettings,
    @Optional() private readonly descriptions?: InboxDescriptions,
    @Optional() private readonly tenants?: TenantEntityManagerService,
  ) {}

  /**
   * The handler for every event of these namespaces, as a class of its own: the dispatcher reads
   * `@OnOutboxMessage()` off the method, so two applications in one process — a suite's — would
   * otherwise each find the other's topics on it.
   *
   * The topics are resolved from the `@EventType` registry when the module is declared, the same
   * registry an event is restored from: an event whose module was never imported is not registered,
   * and could not have been raised here either.
   */
  static of(namespaces: readonly string[]): Type<LocalDelivery> {
    const topics = LocalDelivery.topicsOf(namespaces);

    @Injectable()
    class NamespaceDelivery extends LocalDelivery {
      @OnOutboxMessage(topics, {
        consumer: LocalDelivery.CONSUMER,
        inbox: false,
      })
      override receive(
        payload: unknown,
        context: OutboxHandlerContext,
      ): Promise<void> {
        return super.receive(payload, context);
      }
    }

    return NamespaceDelivery;
  }

  /** The name this service's inbox rows are kept under, whether a message came from a broker or from here. */
  get consumer(): string {
    return this.identity.applicationName;
  }

  async receive(
    _payload: unknown,
    { message }: OutboxHandlerContext,
  ): Promise<void> {
    if (!this.settings.route) {
      this.logger.warn(
        `local ← ${message.topic} (${message.id}) acknowledged, not published: the bus was not given ` +
          `the outbox's route (outbox.useFactory → route), so it told this event at its commit already`,
      );
      return;
    }
    const envelope = envelopeOf(message);
    const arrived = messageOf(envelope);
    const context = this.context.decode(arrived);
    const event = restore(envelope);

    await ingesting(arrived, () =>
      this.inTenantOf(context, () =>
        UnitOfWork.run(() => this.tell(event, arrived, context), context, {
          failOnTrackedFailure: true,
          transaction: this.transaction,
        }),
      ),
    );
  }

  private async tell(
    event: object,
    arrived: Ingestion,
    context?: AsyncContext,
  ): Promise<void> {
    const transaction = UnitOfWork.current()?.transactionHandle;
    const outcome = await this.inbox.processInTransaction(
      transaction,
      this.consumer,
      arrived.identifier,
      async () => {
        this.logger.debug(
          `local ← ${arrived.messageType} (${arrived.identifier})`,
        );
        await this.descriptions?.describeInbox(
          transaction,
          this.consumer,
          arrived.identifier,
          arrived,
        );
        this.publish(event, context);
      },
    );
    if (outcome.duplicate) {
      this.logger.log(
        `local ← ${arrived.messageType} (${arrived.identifier}) dropped: already delivered`,
      );
    }
  }

  private async inTenantOf<T>(
    context: AsyncContext | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!this.tenants) {
      return work();
    }
    const em = await this.tenants.createAndMigrateTenantEntityManager(
      TransportTenantResolver.tenantCarriedBy(context) ?? ROOT_TENANT,
    );
    return RequestContext.create(em, work);
  }

  private publish(event: object, context?: AsyncContext): void {
    if (context) {
      this.eventBus.publish(event, context);
      return;
    }
    this.eventBus.publish(event);
  }

  private static topicsOf(namespaces: readonly string[]): string[] {
    const published = new Set(namespaces);
    return registeredEventTypes()
      .filter((type) => published.has(type.namespace))
      .map((type) => type.qualifiedName)
      .sort();
  }
}
