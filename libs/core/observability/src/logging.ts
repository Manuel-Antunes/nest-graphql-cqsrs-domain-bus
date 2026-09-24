import type { DynamicModule } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import { LoggerModule } from 'nestjs-pino';

export interface LoggingOptions {
  /** The same name the traces carry, so a log line and a span agree about who wrote them. */
  readonly serviceName: string;
  readonly level?: string;
  /** Overrides the rule below: human-readable output, or the JSON a collector reads. */
  readonly pretty?: boolean;
}

const HEALTH = /^\/health/;

/**
 * **The logger, as records rather than sentences.**
 *
 * Nest's own logger writes a formatted line to stdout, which is exactly right in a terminal and
 * exactly wrong everywhere else: a log that has been rendered has to be parsed back before anything
 * can query it, and what was in scope when it was written — the request, the trace — is gone. Pino
 * writes an object.
 *
 * ## What it is really for: joining logs to traces
 * `PinoInstrumentation` (see {@link startTelemetry}) puts the current `trace_id` and `span_id` on
 * every record, and sends the records through the same OTLP pipeline as the spans. So a log line and
 * the span it happened inside stop being two things to correlate by timestamp and become one story:
 * open the trace of a slow `createPost` and the lines that service wrote while handling it are
 * already there, on the span where they happened.
 *
 * That is also why the level matters less than it used to. A `debug` line costs a field in a record
 * nobody reads until the trace it belongs to is the one being looked at.
 *
 * It is also why there is no correlation id of our own here: `trace_id` already is one, it is on
 * every record, and it is the same value three services away.
 *
 * ## Pretty where a person is reading, JSON where a machine is
 * `pino-pretty` when stdout is a terminal, raw JSON otherwise — because `pnpm dev` is read by a
 * person and CloudWatch is read by the collector. It is the one thing this module decides for you,
 * and `pretty` overrides it.
 */
export const loggingModule = (options: LoggingOptions): DynamicModule =>
  LoggerModule.forRoot(loggingParams(options));

export const loggingParams = (options: LoggingOptions): Params => {
  const pretty =
    options.pretty ?? (process.stdout.isTTY === true && !inLambda());

  return {
    pinoHttp: {
      name: options.serviceName,
      level: options.level ?? process.env.LOG_LEVEL ?? 'info',
      ...(pretty
        ? {
            transport: { target: 'pino-pretty', options: { singleLine: true } },
          }
        : {}),
      /**
       * A health check every second is a log line every second, and it buries what somebody is
       * looking for. The same requests `HttpInstrumentation` leaves untraced.
       */
      autoLogging: { ignore: (request) => HEALTH.test(request.url ?? '') },
      /**
       * Credentials never reach a log. A session cookie or a bearer token in a record is a working
       * credential in whatever stores the record — CloudWatch, the collector's destination — and a
       * gateway forwards both on every request it routes.
       */
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    },
  };
};

/** The request and response headers that carry a credential. */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

const inLambda = (): boolean => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
