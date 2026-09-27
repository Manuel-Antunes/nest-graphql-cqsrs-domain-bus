/**
 * `@nestposts/observability/telemetry`, and NOT the package barrel.
 *
 * The barrel is `export * from './logging'` followed by `export * from './telemetry'`, and
 * `logging.ts` imports `nestjs-pino` — so importing `startTelemetry` through it loads `pino` as a
 * side effect of the very statement that is about to start the SDK. By the time `startTelemetry()`
 * runs, `pino` is already in the require cache, and `PinoInstrumentation` patches a module nobody
 * will require again: no record carries a `trace_id` and none is emitted to the OTel logs SDK, so
 * the collector's logs pipeline exports nothing. It fails silently and only once deployed, because
 * locally the SDK is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 *
 * Importing the file directly is what the repository already asks for everywhere else, and here it
 * is load-bearing rather than a matter of taste.
 */
import { startTelemetry } from '@nestposts/observability/telemetry';

startTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'tagging' });
