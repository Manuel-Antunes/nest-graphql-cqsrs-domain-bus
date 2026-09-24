import { startTelemetry } from '@nestposts/observability/telemetry';

startTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'gateway' });
