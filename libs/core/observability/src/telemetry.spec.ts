import { trace } from '@opentelemetry/api';

import { flushTelemetry, startTelemetry } from './telemetry';

describe('telemetry', () => {
  beforeEach(() => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('stays off when nothing says where to send the spans', async () => {
    await expect(
      startTelemetry({ serviceName: 'spec' })(),
    ).resolves.toBeUndefined();
  });

  it('stays off when it is disabled outright', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318');

    await expect(
      startTelemetry({ serviceName: 'spec', enabled: false })(),
    ).resolves.toBeUndefined();
  });

  it('leaves the API a no-op, so a library that traces costs a function call', () => {
    startTelemetry({ serviceName: 'spec' });

    const span = trace.getTracer('spec').startSpan('anything');
    expect(span.isRecording()).toBe(false);
    span.end();
  });

  it('flushes without complaining when no SDK is running', async () => {
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});
