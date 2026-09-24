import { errorReportingOptions } from '@nestposts/observability/error-reporting.options';
import * as Sentry from '@sentry/nextjs';

const options = errorReportingOptions({
  serviceName: 'web',
  openTelemetryIntegration: Sentry.openTelemetryIntegration,
});

if (options.dsn) {
  Sentry.init(options);
}
