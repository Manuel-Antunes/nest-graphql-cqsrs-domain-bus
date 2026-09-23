import { pipeline } from 'node:stream/promises';
import type {
  LambdaResponseStreamed,
  PromiseHandler,
} from '@fastify/aws-lambda';
import awsLambdaFastify from '@fastify/aws-lambda';
import { Logger } from '@nestjs/common';
import type { StreamifyHandler } from 'aws-lambda';
import type { FastifyInstance } from 'fastify';

import { BootTimeoutError } from './boot';
import { lambdaRuntime } from './runtime';
import type { HandlerOptions } from './settle';
import { settle } from './settle';

/** What {@link streamingHandler} needs from a booted application: the Fastify underneath it. */
export interface StreamingApplication {
  readonly instance: FastifyInstance;
}

/** How long the caller is told to wait when the application is still coming up. */
const RETRY_AFTER_SECONDS = '5';

/**
 * **The HTTP entry point: one Nest application, answered as a stream.**
 *
 * Response streaming is what makes a GraphQL API on Lambda more than a request/response endpoint —
 * the first byte leaves before the last one is computed, and an SSE subscription has somewhere to
 * write. It needs three things, and this is all three:
 *
 * 1. a **Function URL** with `InvokeMode: RESPONSE_STREAM` (API Gateway does not do it, in any mode);
 * 2. the handler wrapped in `awslambda.streamifyResponse`;
 * 3. a proxy that hands the response back as a `Readable` instead of a string —
 *    `@fastify/aws-lambda`'s `payloadAsStream`.
 *
 * ## The one line that is not obvious, and what it cost
 * `context.callbackWaitsForEmptyEventLoop = false`. Without it Lambda waits for the event loop to
 * drain before finishing the invocation — and this application holds a MikroORM pool, a transport
 * client and OpenTelemetry's batch timers, so the loop **never** drains. Every invocation then runs
 * to the full timeout: the container stays busy, no warm instance is ever reused, and every request
 * pays a cold start while being billed for the timeout.
 *
 * ## Why the proxy is cached and the application is not re-created
 * The Fastify instance comes from {@link bootOnce}, which booted it during the init phase. The proxy
 * wrapping it is built on the first invocation and kept, because rebuilding it per request rebuilds
 * the routing table of a server that has not changed.
 */
export const streamingHandler = (
  booted: () => Promise<StreamingApplication>,
  options: HandlerOptions = {},
): StreamifyHandler => {
  const logger = new Logger('streamingHandler');
  const runtime = lambdaRuntime();
  let proxy: PromiseHandler<unknown, LambdaResponseStreamed> | undefined;

  return runtime.streamifyResponse(async (event, responseStream, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    try {
      let application: StreamingApplication;
      try {
        application = await booted();
      } catch (failure) {
        if (!(failure instanceof BootTimeoutError)) {
          throw failure;
        }
        logger.error(`${failure.message} — answering 503`);
        unavailable(
          runtime.HttpResponseStream.from(responseStream, UNAVAILABLE),
        );
        return;
      }

      proxy ??= awsLambdaFastify<unknown, typeof PROXY_OPTIONS>(
        application.instance,
        PROXY_OPTIONS,
      );
      const dispatch = proxy;

      const { meta, stream } = await dispatch(event, context);
      await pipeline(
        stream,
        runtime.HttpResponseStream.from(responseStream, { ...meta }),
      );
    } finally {
      /**
       * The response is already with the caller; this only keeps the sandbox alive long enough to
       * finish what the request started and export its spans. A Lambda has no shutdown — the runtime
       * freezes the container the moment the handler returns — so work that was merely started does
       * not continue, and spans the batch processor is holding are sent whenever, or never.
       */
      await settle(options);
    }
  });
};

/**
 * `payloadAsStream` is what makes the proxy answer with a `Readable` instead of a string, and
 * `decorateRequest` is off because nothing in this application reads `request.awsLambda`: the
 * handlers are the same ones an HTTP server serves, and a request that knows it is in Lambda is a
 * request that could start behaving differently there.
 */
const PROXY_OPTIONS = {
  payloadAsStream: true,
  decorateRequest: false,
} as const;

const UNAVAILABLE = {
  statusCode: 503,
  headers: {
    'content-type': 'application/json',
    'retry-after': RETRY_AFTER_SECONDS,
  },
};

const unavailable = (stream: NodeJS.WritableStream): void => {
  stream.write(
    JSON.stringify({
      error: 'service_unavailable',
      message: 'The API is still starting up. Please retry shortly.',
    }),
  );
  stream.end();
};
