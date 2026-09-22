import { startTelemetry } from '@nestposts/observability';

startTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'posts-api' });
