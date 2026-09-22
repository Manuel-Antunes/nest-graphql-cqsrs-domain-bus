import { trace } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  /** What this process is called in a trace. One name per deployable, not per module. */
  readonly serviceName: string;
  readonly serviceVersion?: string;
  /**
   * Overrides the rule below: `true` starts the SDK with no endpoint configured (the OTLP default,
   * `http://localhost:4318`), `false` keeps it off whatever the environment says.
   */
  readonly enabled?: boolean;
  /** Replaces the default list entirely — for a process that instruments less. */
  readonly instrumentations?: Instrumentation[];
}

/** What {@link startTelemetry} answers: stop the SDK, flushing whatever it is holding. */
export type TelemetryHandle = () => Promise<void>;

let started: NodeSDK | undefined;

/**
 * **The OpenTelemetry SDK, started before anything else in the process.**
 *
 * It has to be first, and that is not a style preference: the instrumentations work by patching the
 * modules they instrument as they are required, so a `pg` or an `http` that was loaded before this
 * ran is a module nothing is watching. In practice that means the first line of `main.ts`, above the
 * imports that pull the application in — which is why the two services call it from a file of their
 * own rather than inside `bootstrap()`.
 *
 * ## It is off unless something is listening
 * Started with no collector configured, the OTLP exporter posts to `http://localhost:4318` and logs
 * a connection failure every few seconds — in every local run, in every test, forever. So the SDK
 * starts when `OTEL_EXPORTER_OTLP_ENDPOINT` (or the signal-specific one) says where to send its
 * telemetry, and otherwise does not: the API stays a no-op, `injectTraceContext` writes nothing, and
 * nothing in the application behaves differently. One environment variable turns the whole thing on.
 *
 * ```bash
 * OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm dev
 * ```
 *
 * ## In Lambda it exports one span at a time, and that is the point
 * A function's container is **frozen** the moment its handler returns, so anything a batch processor
 * is still holding is sent whenever — or never, if that container is reaped. The usual answer is to
 * flush by hand at the end of every invocation, which costs a round trip per request and puts a
 * telemetry concern in the middle of application code.
 *
 * The better answer is where the batching happens. With the **collector extension** on the function
 * (`infra/lambda/collector.yaml`), the export is a call to `localhost` — cheap enough to do per
 * span — and the collector does the batching, the retrying and the flushing, in a process the Lambda
 * runtime tells about the end of each invocation. So here the SDK sends immediately and holds
 * nothing, and nobody has to remember to flush.
 *
 * Outside Lambda the trade is the other way round: the network is real, the process is not frozen,
 * and batching is right.
 */
export const startTelemetry = (options: TelemetryOptions): TelemetryHandle => {
  if (started || !isEnabled(options)) {
    return async () => undefined;
  }

  const immediate = inLambda();
  const sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: options.serviceName,
        [ATTR_SERVICE_VERSION]: options.serviceVersion ?? process.env.npm_package_version,
        'deployment.environment.name': process.env.NODE_ENV ?? 'development',
      }),
    ),
    spanProcessors: [
      immediate
        ? new SimpleSpanProcessor(new OTLPTraceExporter())
        : new BatchSpanProcessor(new OTLPTraceExporter()),
    ],
    logRecordProcessors: [
      immediate
        ? new SimpleLogRecordProcessor({ exporter: new OTLPLogExporter() })
        : new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ],
    instrumentations: options.instrumentations ?? defaultInstrumentations(),
  });

  sdk.start();
  started = sdk;

  return async () => {
    started = undefined;
    await sdk.shutdown();
  };
};

/**
 * **Everything buffered, sent now** — for a process that is shutting down.
 *
 * It is **not** what a Lambda handler calls per invocation any more: with the collector extension
 * there is nothing buffered in process to flush, and the extension is told about the end of the
 * invocation by the runtime itself. Keeping it here is for the other shape — a container stopping,
 * a test tearing down — where a flush before exit is still the difference between having the last
 * spans and not.
 */
export const flushTelemetry = async (): Promise<void> => {
  const provider = trace.getTracerProvider() as {
    getDelegate?: () => unknown;
    forceFlush?: () => Promise<void>;
  };
  const delegate = (provider.getDelegate?.() ?? provider) as { forceFlush?: () => Promise<void> };
  await delegate.forceFlush?.();
};

/**
 * The seven the system is made of. `ignoreIncomingRequestHook` keeps the health checks out: a poll
 * every second is a trace every second, and it buries the requests somebody cares about.
 *
 * `PinoInstrumentation` is what joins the two halves: it puts the current `trace_id` and `span_id`
 * on every log record, so a log line and the span it happened inside are the same story told twice
 * rather than two things to correlate by timestamp.
 */
const defaultInstrumentations = (): Instrumentation[] => [
  new HttpInstrumentation({
    ignoreIncomingRequestHook: (request) => (request.url ?? '').startsWith('/health'),
  }),
  new NestInstrumentation(),
  new GraphQLInstrumentation({ allowValues: false, ignoreTrivialResolveSpans: true }),
  new PgInstrumentation(),
  new AmqplibInstrumentation(),
  new AwsInstrumentation(),
  new PinoInstrumentation(),
];

const inLambda = (): boolean => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const isEnabled = (options: TelemetryOptions): boolean => {
  if (options.enabled !== undefined) {
    return options.enabled;
  }
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    return false;
  }
  return Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  );
};
