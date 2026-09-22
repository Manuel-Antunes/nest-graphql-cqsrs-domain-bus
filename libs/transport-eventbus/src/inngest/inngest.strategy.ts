import { type HttpServer, Logger } from '@nestjs/common';
import {
  type ConsumerDeserializer,
  type ConsumerSerializer,
  type CustomTransportStrategy,
  Server,
  type TransportId,
} from '@nestjs/microservices';
import type { FastifyInstance } from 'fastify';
import type { EventPayload, Inngest, InngestFunction } from 'inngest';
import { fastifyPlugin } from 'inngest/fastify';
import { InngestContext, type InngestStepTools } from './inngest.context';
import { type InngestEvents, InngestEventsMap, InngestStatus } from './inngest.events';
import { MAX_TRIGGERS, inngestFunctionId, inngestTriggers } from './inngest-triggers';

export const INNGEST_DEFAULT_SERVE_PATH = '/api/inngest';

export interface InngestStrategyOptions {
  /** The Inngest client the functions are created on — the same one the client proxy sends through. */
  readonly inngest: Inngest.Any;
  /**
   * **How a message becomes an event**, and it is not optional: this strategy will not choose a wire
   * format on its caller's behalf. `InngestEventEnvelopeDeserializer` is the one this library ships.
   */
  readonly deserializer: ConsumerDeserializer;
  /**
   * What a handler's **answer** is serialized with, which an event never has. Left out, Nest's own
   * `IdentitySerializer` applies — the default belongs to the base class, not here.
   */
  readonly serializer?: ConsumerSerializer;
  /**
   * The Nest HTTP adapter Inngest is served from. Inngest reaches a service by **calling** it, so
   * there has to be something to call: pass `app.getHttpAdapter()`, or set it with
   * {@link setHttpAdapter} before `startAllMicroservices()`. The strategy never opens a port of its
   * own — the host application owns it.
   */
  readonly httpAdapter?: HttpServer;
  /** Where the functions are served. @default '/api/inngest' */
  readonly servePath?: string;
  /**
   * **The origin this service is reachable at**, when it is not the one the registration request
   * arrived on. The SDK otherwise derives what it advertises from that request's `Host` — so a
   * registration triggered from outside the network registers an address that only exists outside
   * it, Inngest calls something that is not this service, and every run hangs in `Running` with
   * nothing in any log. Left out, `INNGEST_SERVE_ORIGIN` answers, and then the request does.
   *
   * ```ts
   * new InngestStrategy({ ..., serveOrigin: 'http://tagging:3001' })
   * ```
   */
  readonly serveOrigin?: string;
}

/**
 * **The receiving half on Inngest: a function is the binding, and the invocation is the delivery.**
 *
 * It is `ServerRMQ`'s counterpart and deliberately the same shape from the controller's side: an
 * `@EventPattern` is a binding, `@TransportEvent()` is the domain event, guards and interceptors and
 * filters apply. A service moved from RabbitMQ to Inngest changes its bootstrap and nothing else.
 *
 * ## Why the binding is resolved at boot
 * A queue is bound by a routing key the broker matches at delivery time; an Inngest function
 * **declares** the exact event names that trigger it. So `posts.#` cannot be handed over as it is —
 * it is expanded through {@link inngestTriggers} into one trigger per registered event of that
 * namespace, at the moment the functions are created. The handler is still one, and the message type
 * in the envelope is still what resolves the concrete class.
 *
 * ## Why it mounts and does not listen
 * Inngest invokes a function over HTTP, so a service that receives has to be reachable. This
 * registers the serve handler onto the **host application's** Fastify instance and returns; the host
 * owns the port and the lifecycle. It is why `apps/tagging` is a hybrid rather than a pure
 * microservice on this transport — the one thing this transport costs that a broker does not.
 */
export class InngestStrategy
  extends Server<InngestEvents, InngestStatus>
  implements CustomTransportStrategy
{
  override transportId: TransportId = Symbol.for('nestposts.transport-eventbus.inngest');

  protected override readonly logger = new Logger(InngestStrategy.name);

  private readonly inngest: Inngest.Any;
  private readonly servePath: string;
  private readonly serveOrigin?: string;
  private readonly functions = new Map<string, InngestFunction.Any>();
  private readonly listeners: { event: keyof InngestEvents; callback: InngestEvents[keyof InngestEvents] }[] = [];

  private httpAdapter?: HttpServer;
  private fastify?: FastifyInstance;

  constructor(protected readonly options: InngestStrategyOptions) {
    super();
    this.inngest = options.inngest;
    this.servePath = options.servePath ?? INNGEST_DEFAULT_SERVE_PATH;
    this.serveOrigin = options.serveOrigin ?? process.env.INNGEST_SERVE_ORIGIN;
    this.httpAdapter = options.httpAdapter;
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  /** For a host that builds the strategy before it has an adapter to give it. */
  setHttpAdapter(adapter: HttpServer): void {
    this.httpAdapter = adapter;
  }

  async listen(callback: (...optionalParams: unknown[]) => void): Promise<void> {
    this._status$.next(InngestStatus.STARTING);
    try {
      this.createFunctions();
      this.mount();
      this._status$.next(InngestStatus.CONNECTED);
      this.emitEvent(InngestEventsMap.LISTENING);
      this.logger.log(
        `${this.functions.size} function(s) served at ${this.servePath} (${this.triggerSummary()})`,
      );
      callback();
    } catch (failure) {
      this._status$.next(InngestStatus.DISCONNECTED);
      this.emitEvent(InngestEventsMap.ERROR, failure as Error);
      callback(failure);
    }
  }

  async close(): Promise<void> {
    this.functions.clear();
    this.fastify = undefined;
    this._status$.next(InngestStatus.DISCONNECTED);
    this.emitEvent(InngestEventsMap.CLOSE);
  }

  /** The Inngest client and the server it was mounted on, for a spec that wants to look. */
  override unwrap<T>(): T {
    return { inngest: this.inngest, fastify: this.fastify, functions: this.functions } as T;
  }

  on<
    EventKey extends keyof InngestEvents = keyof InngestEvents,
    EventCallback extends InngestEvents[EventKey] = InngestEvents[EventKey],
  >(event: EventKey, callback: EventCallback): void {
    this.listeners.push({ event, callback });
  }

  /**
   * One invocation, from the event Inngest brings to the handler that was bound for it. The bound
   * pattern is passed rather than the event's name, because the pattern is what the controller
   * declared and the name is only one of the things it stands for.
   */
  async handleMessage(
    pattern: string,
    event: EventPayload,
    step: InngestStepTools,
    runId: string,
    attempt: number,
  ): Promise<unknown> {
    const message = await this.deserializer.deserialize(event, { channel: pattern });
    const context = new InngestContext([event, pattern, step, runId, attempt]);

    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      this.logger.warn(`no handler for '${pattern}' — the run is acknowledged and dropped`);
      return undefined;
    }

    return this.onProcessingStartHook(this.transportId as TransportId, context, async () => {
      const response$ = this.transformToObservable(await handler(message.data, context));

      return new Promise((resolve, reject) => {
        this.send(response$, (packet) => {
          this.onProcessingEndHook?.(this.transportId as TransportId, context);
          if (packet.err) {
            reject(packet.err);
          } else {
            resolve(this.serializer.serialize(packet.response));
          }
        });
      });
    });
  }

  private createFunctions(): void {
    for (const pattern of this.getHandlers().keys()) {
      const triggers = inngestTriggers(pattern);
      if (triggers.length === 0) {
        this.logger.warn(
          `'${pattern}' matches no registered event type, so no Inngest function was created for ` +
            'it — nothing will ever trigger this handler.',
        );
        continue;
      }
      if (triggers.length > MAX_TRIGGERS) {
        throw new Error(
          `'${pattern}' stands for ${triggers.length} event types and Inngest takes at most ` +
            `${MAX_TRIGGERS} triggers on one function (${triggers.join(', ')}). Bind the types this ` +
            'service actually reacts to, one pattern each, instead of the whole namespace.',
        );
      }
      this.functions.set(pattern, this.functionFor(pattern, triggers));
    }
  }

  private functionFor(pattern: string, triggers: string[]): InngestFunction.Any {
    return this.inngest.createFunction(
      {
        id: inngestFunctionId(pattern),
        name: `Handle ${pattern}`,
        triggers: triggers.map((event) => ({ event })),
      } as never,
      (async ({ event, step, runId, attempt }: {
        event: EventPayload;
        step: InngestStepTools;
        runId: string;
        attempt: number;
      }) => this.handleMessage(pattern, event, step, runId, attempt)) as never,
    );
  }

  private mount(): void {
    if (!this.httpAdapter) {
      throw new Error(
        'InngestStrategy needs a Nest HTTP adapter: Inngest reaches a service by calling it. Pass ' +
          '`httpAdapter: app.getHttpAdapter()` in the options, or call `setHttpAdapter(...)` before ' +
          '`startAllMicroservices()`.',
      );
    }

    const instance = this.httpAdapter.getInstance() as Partial<FastifyInstance>;
    if (typeof instance?.register !== 'function' || !instance.server) {
      throw new Error(
        'InngestStrategy serves through inngest/fastify, so the host application has to be a ' +
          'Fastify one: create it with `new FastifyAdapter()`.',
      );
    }

    this.fastify = instance as FastifyInstance;
    this.fastify.register(fastifyPlugin as never, {
      client: this.inngest,
      functions: [...this.functions.values()],
      options: {
        servePath: this.servePath,
        ...(this.serveOrigin ? { serveOrigin: this.serveOrigin } : {}),
      },
    } as never);
  }

  private triggerSummary(): string {
    return [...this.functions.keys()]
      .map((pattern) => `${pattern} → ${inngestTriggers(pattern).length}`)
      .join(', ');
  }

  private emitEvent(event: keyof InngestEvents, ...args: unknown[]): void {
    for (const listener of this.listeners.filter((candidate) => candidate.event === event)) {
      (listener.callback as (...params: unknown[]) => void)(...args);
    }
  }
}
