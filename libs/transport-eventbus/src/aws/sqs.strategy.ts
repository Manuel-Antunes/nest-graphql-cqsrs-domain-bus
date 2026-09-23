import type { Message, SQSClientConfig } from '@aws-sdk/client-sqs';
import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';
import type {
  ConsumerDeserializer,
  ConsumerSerializer,
  CustomTransportStrategy,
  MessageHandler,
  TransportId,
} from '@nestjs/microservices';
import { Server } from '@nestjs/microservices';
import type { Context as LambdaContext, SQSEvent, SQSRecord } from 'aws-lambda';

import { topicMatches } from '../in-memory/topic-pattern';
import {
  awsClientConfig,
  queueArnFromUrl,
  queueNameOf,
} from './aws-client.config';
import { fromRecordAttributes } from './aws-message';
import { SqsContext } from './sqs.context';
import type { SqsEvents } from './sqs.events';
import { SqsEventsMap, SqsStatus } from './sqs.events';

/** How many messages one `ReceiveMessage` may bring back, and SQS's own ceiling. */
const MAX_BATCH = 10;

/** Long polling: an empty receive waits instead of returning, which is what keeps the bill down. */
const DEFAULT_WAIT_SECONDS = 20;

/** How long the poller waits after a failed receive before trying again. */
const RECEIVE_BACKOFF_MS = 1_000;

export interface SqsStrategyOptions {
  /**
   * **How a message becomes an event**, and it is not optional: this strategy will not choose a wire
   * format on its caller's behalf. `SqsEventEnvelopeDeserializer` is the one this library ships; a
   * service consuming messages somebody else publishes passes a deserializer of its own.
   */
  readonly deserializer: ConsumerDeserializer;
  /**
   * What a handler's **answer** is serialized with, which an event never has. Left out, Nest's own
   * `IdentitySerializer` applies — the default belongs to the base class, not here.
   */
  readonly serializer?: ConsumerSerializer;
  /**
   * **The queue this process polls**, or the queues. Given, `listen()` starts a receive loop each and
   * the service consumes like any long-running worker; left out, the strategy waits to be driven by
   * a Lambda — see {@link processSqsEvent}.
   *
   * More than one because a **process** can serve several queues where a function serves exactly
   * one: a Lambda has a single event source, and a long-running consumer has whatever it is pointed
   * at. Be careful what that buys, though — SQS orders messages **within** a queue, so a consumer
   * that appends to one aggregate's stream wants one queue, not several (see
   * `infra/aws/messaging/queues.ts`, where that was measured).
   */
  readonly queueUrl?: string | readonly string[];
  readonly client?: SQSClient;
  readonly clientConfig?: SQSClientConfig;
  /** Polling only: how many messages one receive may bring back (1–10). */
  readonly maxNumberOfMessages?: number;
  /** Polling only: how long an empty receive waits before answering (0–20). */
  readonly waitTimeSeconds?: number;
  /** Polling only: overrides the queue's own visibility timeout for the messages this receive takes. */
  readonly visibilityTimeoutSeconds?: number;
  /** Whether the records of one delivery are handled one after another (the default) or at once. */
  readonly concurrency?: 'sequential' | 'parallel';
}

/** One record's outcome: what the handler answered, or what it threw. */
export interface SqsProcessResult {
  readonly response?: unknown;
  readonly err?: unknown;
}

/** What `app.unwrap()` answers for an application listening on this strategy. */
export interface SqsConsumer {
  readonly processEvent: (
    event: SQSEvent,
    lambdaContext?: LambdaContext,
  ) => Promise<SqsProcessResult[]>;
}

/**
 * **The receiving half on AWS: an SQS queue as a Nest microservice transport.**
 *
 * It is `ServerRMQ`'s counterpart, and deliberately the same shape from the controller's side: an
 * `@EventPattern` is a routing key with wildcards, `@TransportEvent()` is the domain event, guards
 * and interceptors and filters apply. A service moved from RabbitMQ to SQS changes its bootstrap and
 * nothing else.
 *
 * ## Two ways to be driven, one class
 * | `queueUrl` | `listen()` | who decides a message is done |
 * |---|---|---|
 * | given | starts a long-polling receive loop | this class: it deletes what succeeded |
 * | omitted | returns immediately | Lambda: the handler reports what failed ({@link processSqsEvent}) |
 *
 * The second is production and the first is everything else — `docker compose` with LocalStack,
 * `pnpm dev`, an e2e suite — and they run the **same** `processRecord`, so what local development
 * exercises is what deploys.
 *
 * ## Why it matches patterns itself
 * Because a queue has no bindings. On RabbitMQ the exchange decides what reaches the queue and the
 * routing key that arrives is matched against the handler's pattern by `ServerRMQ`; here SNS's filter
 * policy decides what reaches the queue ({@link SnsFilterPolicy}) and nothing has matched the
 * pattern yet. So `posts.#` is matched against `posts.PostCreated.9f1d…` here, with the same
 * {@link topicMatches} the in-process transport uses — one implementation of "what does this binding
 * mean", for every transport that is not a broker.
 *
 * ## What an error does
 * Nothing is acknowledged by hand. A record whose handler threw is left undeleted (polling) or
 * reported in `batchItemFailures` (Lambda), and SQS redelivers it after the visibility timeout.
 * That is the whole of it: this strategy has no opinion about what a particular failure means, and
 * a service that wants one puts it in its own handler, where the failure is understood.
 */
export class SqsStrategy
  extends Server<SqsEvents, SqsStatus>
  implements CustomTransportStrategy
{
  override transportId: TransportId = Symbol.for(
    'nestposts.transport-eventbus.sqs',
  );

  protected override readonly logger = new Logger(SqsStrategy.name);

  private readonly client: SQSClient;
  private readonly ownsClient: boolean;
  private readonly listeners: {
    event: keyof SqsEvents;
    callback: SqsEvents[keyof SqsEvents];
  }[] = [];
  private readonly polling = new AbortController();

  private wildcards?: Map<string, MessageHandler>;
  private closed = false;
  private loops: Promise<void>[] = [];

  constructor(protected readonly options: SqsStrategyOptions) {
    super();
    this.ownsClient = !options.client;
    this.client =
      options.client ??
      new SQSClient({ ...awsClientConfig(), ...options.clientConfig });
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  async listen(
    callback: (...optionalParams: unknown[]) => void,
  ): Promise<void> {
    this._status$.next(SqsStatus.CONNECTED);
    this.emitEvent(SqsEventsMap.LISTENING);

    const queues = queueUrlsOf(this.options.queueUrl);
    if (queues.length > 0) {
      this.loops = queues.map((queueUrl) => this.poll(queueUrl));
      this.logger.log(`polling ${queues.map(queueNameOf).join(', ')}`);
    } else {
      this.logger.log('ready; waiting to be invoked with an SQS event');
    }
    callback();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.polling.abort();
    await Promise.all(this.loops.map((loop) => loop.catch(() => undefined)));
    if (this.ownsClient) {
      this.client.destroy();
    }
    this._status$.next(SqsStatus.DISCONNECTED);
    this.emitEvent(SqsEventsMap.CLOSE);
  }

  /**
   * **Every record of one delivery, and one result per record.**
   *
   * Every record: a batch that stopped at the first failure would leave the rest undelivered while
   * the invocation returned successfully, and SQS deletes what the invocation did not report as
   * failed — so records 2..N would be dropped, silently, and only under load, because a quiet queue
   * hands over one message at a time.
   *
   * `sequential` by default. These handlers write to a database inside a transaction, and ten of
   * them at once is ten connections from one invocation — the parallel mode is there for a consumer
   * whose work is IO against something that likes concurrency, and it is a choice, not the default.
   */
  async processEvent(
    event: SQSEvent,
    lambdaContext?: LambdaContext,
  ): Promise<SqsProcessResult[]> {
    const records = event.Records ?? [];
    this.logger.debug(`${records.length} record(s) received`);

    if (this.options.concurrency === 'parallel') {
      return Promise.all(
        records.map((record) => this.handleRecord(record, lambdaContext)),
      );
    }

    const results: SqsProcessResult[] = [];
    for (const record of records) {
      results.push(await this.handleRecord(record, lambdaContext));
    }
    return results;
  }

  /**
   * One record, from its body to the handler that wanted it. The deserializer is given the record's
   * message attributes beside the parsed body, because a message published by something other than
   * this library has its description there and nowhere else.
   */
  async processRecord(
    record: SQSRecord,
    lambdaContext?: LambdaContext,
  ): Promise<unknown> {
    const attributes = fromRecordAttributes(record.messageAttributes);
    const message = await this.deserializer.deserialize(bodyOf(record), {
      attributes,
      record,
    });

    if (!message.pattern) {
      throw new Error(
        `SQS message ${record.messageId} carries no pattern: neither the body nor its attributes ` +
          'say what it is. Publish it through a client that declares AwsEventEnvelopeSerializer.',
      );
    }

    const context = new SqsContext([
      record,
      message.pattern,
      lambdaContext,
      attributes,
    ]);
    return this.handleMessage(message.pattern, message.data, context);
  }

  /** The handler, run through the hooks Nest wraps every transport's dispatch in. */
  async handleMessage(
    pattern: string,
    data: unknown,
    context: SqsContext,
  ): Promise<unknown> {
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      this.logger.warn(
        `no handler for '${pattern}' — the message is acknowledged and dropped`,
      );
      return undefined;
    }

    return this.onProcessingStartHook(
      this.transportId as TransportId,
      context,
      async () => {
        const response$ = this.transformToObservable(
          await handler(data, context),
        );

        return new Promise((resolve, reject) => {
          this.send(response$, (packet) => {
            this.onProcessingEndHook?.(
              this.transportId as TransportId,
              context,
            );
            if (packet.err) {
              reject(packet.err);
            } else {
              resolve(this.serializer.serialize(packet.response));
            }
          });
        });
      },
    );
  }

  /**
   * Exact first, then the wildcards — `ServerRMQ`'s order, for the same reason: a handler bound to
   * the literal key is a more specific statement than one bound to `posts.#`, and a message matching
   * both belongs to whoever asked for it by name.
   */
  override getHandlerByPattern(pattern: string): MessageHandler | null {
    const exact = super.getHandlerByPattern(pattern);
    if (exact) {
      return exact;
    }
    for (const [candidate, handler] of this.wildcardHandlers()) {
      if (topicMatches(candidate, pattern)) {
        return handler;
      }
    }
    return null;
  }

  /** The consumer a Lambda handler drives — see {@link processSqsEvent}. */
  override unwrap<T>(): T {
    return {
      processEvent: (event: SQSEvent, lambdaContext?: LambdaContext) =>
        this.processEvent(event, lambdaContext),
    } satisfies SqsConsumer as T;
  }

  on<
    EventKey extends keyof SqsEvents = keyof SqsEvents,
    EventCallback extends SqsEvents[EventKey] = SqsEvents[EventKey],
  >(event: EventKey, callback: EventCallback): void {
    this.listeners.push({ event, callback });
  }

  private async handleRecord(
    record: SQSRecord,
    lambdaContext?: LambdaContext,
  ): Promise<SqsProcessResult> {
    try {
      return { response: await this.processRecord(record, lambdaContext) };
    } catch (failure) {
      return { err: toError(failure) };
    }
  }

  /**
   * The receive loop. It deletes what succeeded and leaves what failed, which is the whole of the
   * acknowledgement protocol: an undeleted message comes back when its visibility timeout runs out.
   *
   * The receive is abortable, so closing the application does not wait out the twenty seconds a long
   * poll is in the middle of.
   */
  private async poll(queueUrl: string): Promise<void> {
    const eventSourceARN = queueArnFromUrl(queueUrl);

    while (!this.closed) {
      const messages = await this.receive(queueUrl);
      if (messages.length === 0) {
        continue;
      }

      const records = messages.map((message) =>
        recordOf(message, eventSourceARN),
      );
      const results = await this.processEvent({ Records: records });
      await this.deleteSucceeded(queueUrl, records, results);
    }
  }

  private async receive(queueUrl: string): Promise<Message[]> {
    try {
      const received = await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: Math.min(
            this.options.maxNumberOfMessages ?? MAX_BATCH,
            MAX_BATCH,
          ),
          WaitTimeSeconds: this.options.waitTimeSeconds ?? DEFAULT_WAIT_SECONDS,
          VisibilityTimeout: this.options.visibilityTimeoutSeconds,
          MessageAttributeNames: ['All'],
          MessageSystemAttributeNames: ['All'],
        }),
        { abortSignal: this.polling.signal },
      );
      return received.Messages ?? [];
    } catch (failure) {
      if (this.closed) {
        return [];
      }
      this.logger.error(
        `receive on ${queueNameOf(queueUrl)} failed; retrying: ${(failure as Error)?.message ?? failure}`,
      );
      this.emitEvent(SqsEventsMap.ERROR, toError(failure));
      await sleep(RECEIVE_BACKOFF_MS);
      return [];
    }
  }

  private async deleteSucceeded(
    queueUrl: string,
    records: SQSRecord[],
    results: SqsProcessResult[],
  ): Promise<void> {
    const entries = records
      .map((record, index) => ({
        record,
        failed: Boolean(results[index]?.err),
      }))
      .filter(({ failed }) => !failed)
      .map(({ record }, index) => ({
        Id: String(index),
        ReceiptHandle: record.receiptHandle,
      }));

    if (entries.length === 0) {
      return;
    }
    try {
      await this.client.send(
        new DeleteMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }),
      );
    } catch (failure) {
      this.logger.error(
        `could not delete ${entries.length} handled message(s) from ${queueNameOf(queueUrl)}; ` +
          `they will be redelivered and the inbox will drop them: ${(failure as Error)?.message ?? failure}`,
      );
    }
  }

  /**
   * Resolved once: the handlers are registered before `listen()`, and rebuilding the map per message
   * would walk every pattern of the application on every delivery.
   */
  private wildcardHandlers(): Map<string, MessageHandler> {
    if (!this.wildcards) {
      this.wildcards = new Map(
        [...this.getHandlers().entries()].filter(
          ([pattern]) => pattern.includes('*') || pattern.includes('#'),
        ),
      );
    }
    return this.wildcards;
  }

  private emitEvent(event: keyof SqsEvents, ...args: unknown[]): void {
    for (const listener of this.listeners.filter(
      (candidate) => candidate.event === event,
    )) {
      (listener.callback as (...params: unknown[]) => void)(...args);
    }
  }
}

const queueUrlsOf = (
  queueUrl: string | readonly string[] | undefined,
): string[] => {
  if (!queueUrl) {
    return [];
  }
  return (typeof queueUrl === 'string' ? [queueUrl] : [...queueUrl]).filter(
    Boolean,
  );
};

const bodyOf = (record: SQSRecord): unknown => {
  try {
    return JSON.parse(record.body);
  } catch {
    return record.body;
  }
};

const recordOf = (message: Message, eventSourceARN: string): SQSRecord => ({
  messageId: message.MessageId ?? '',
  receiptHandle: message.ReceiptHandle ?? '',
  body: message.Body ?? '',
  attributes: (message.Attributes ?? {}) as SQSRecord['attributes'],
  messageAttributes: Object.fromEntries(
    Object.entries(message.MessageAttributes ?? {}).map(([key, attribute]) => [
      key,
      {
        stringValue: attribute.StringValue,
        binaryValue: undefined,
        stringListValues: [],
        binaryListValues: [],
        dataType: attribute.DataType ?? 'String',
      },
    ]),
  ),
  md5OfBody: message.MD5OfBody ?? '',
  eventSource: 'aws:sqs',
  eventSourceARN,
  awsRegion: eventSourceARN.split(':')[3] ?? '',
});

/**
 * Lambda stringifies a non-`Error` throw with `String(value)`, which turns a plain object into
 * `[object Object]` and loses what was thrown. Keeping the original as `cause` is what makes the
 * failure readable in the log the invocation leaves behind.
 */
const toError = (failure: unknown): Error => {
  if (failure instanceof Error) {
    return failure;
  }
  const message =
    typeof failure === 'string'
      ? failure
      : ((safeStringify(failure) ?? String(failure)) as string);
  return new Error(message, { cause: failure });
};

const safeStringify = (value: unknown): string | undefined => {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
