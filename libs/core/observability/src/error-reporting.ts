import * as Sentry from '@sentry/nestjs';

import type { ErrorReportingOptions } from './error-reporting.options';
import { errorReportingOptions } from './error-reporting.options';

const FLUSH_TIMEOUT_MS = 2_000;

/** What a report can carry besides the failure: tags, contexts, the mechanism that caught it. */
export type ErrorReportHint = Parameters<typeof Sentry.captureException>[1];

/**
 * **Sentry's Nest SDK, as the destination of this process's errors and nothing else** — with the
 * configuration `errorReportingOptions` describes.
 *
 * `startTelemetry` calls it once the tracer provider exists, which is the order Sentry asks for; a
 * process that starts no telemetry (the migrator) calls it itself. It starts once, and with no DSN
 * it does nothing and every report is a no-op.
 */
export const startErrorReporting = (options: ErrorReportingOptions): void => {
  const settings = errorReportingOptions({
    ...options,
    openTelemetryIntegration: Sentry.openTelemetryIntegration,
  });
  if (!settings.dsn || Sentry.isInitialized()) {
    return;
  }
  Sentry.init(settings);
};

/**
 * **One failure, reported** — and, in a Lambda, delivered before this resolves.
 *
 * A function's container is frozen the moment its handler answers, and a report still in flight is
 * lost with it. So where `LAMBDA_TASK_ROOT` says this is a Lambda, the report is flushed on the spot
 * — the rule Sentry's own serverless integrations follow (`flushIfServerless`) — and whoever awaits
 * this has delivered it before the failure goes any further. Everywhere else the transport sends it
 * in the background.
 */
export const reportError = async (
  failure: unknown,
  hint?: ErrorReportHint,
): Promise<void> => {
  if (!Sentry.isInitialized()) {
    return;
  }
  Sentry.captureException(failure, hint);
  if (process.env.LAMBDA_TASK_ROOT) {
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  }
};
