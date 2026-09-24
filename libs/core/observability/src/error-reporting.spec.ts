import * as Sentry from '@sentry/nestjs';

import { reportError, startErrorReporting } from './error-reporting';
import { errorReportingOptions } from './error-reporting.options';

const integration = (name: string) => ({ name });

describe('errorReportingOptions', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps Sentry out of tracing and links each report to the active span instead', () => {
    const options = errorReportingOptions({
      serviceName: 'posts-api',
      openTelemetryIntegration: () => integration('OpenTelemetry'),
    });

    expect(options.enableOpenTelemetrySetup).toBe(false);
    expect(options.tracePropagationTargets).toEqual([]);
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(
      options
        .integrations(
          ['LinkedErrors', 'ProcessSession', 'Fastify', 'Express', 'Http'].map(
            integration,
          ),
        )
        .map(({ name }) => name),
    ).toEqual(['LinkedErrors', 'Http', 'OpenTelemetry']);
  });

  it('never collects a credential', () => {
    const { dataCollection } = errorReportingOptions({
      serviceName: 'gateway',
      openTelemetryIntegration: () => integration('OpenTelemetry'),
    });

    expect(dataCollection.cookies).toBe(false);
    expect(dataCollection.userInfo).toBe(false);
    expect(dataCollection.httpHeaders.request.deny).toEqual(
      expect.arrayContaining(['authorization', 'cookie', 'set-cookie']),
    );
  });

  it('reads the destination, the environment and the release from the environment', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@errors.example/7');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'dev');
    vi.stubEnv('SENTRY_RELEASE', 'abc123');

    expect(
      errorReportingOptions({
        serviceName: 'tagging',
        openTelemetryIntegration: () => integration('OpenTelemetry'),
      }),
    ).toMatchObject({
      dsn: 'https://public@errors.example/7',
      environment: 'dev',
      release: 'abc123',
      initialScope: { tags: { service: 'tagging' } },
    });
  });
});

describe('startErrorReporting', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('starts nothing without a DSN, and a report is then a no-op', async () => {
    vi.stubEnv('SENTRY_DSN', '');

    startErrorReporting({ serviceName: 'spec' });

    expect(Sentry.isInitialized()).toBe(false);
    await expect(reportError(new Error('nowhere'))).resolves.toBeUndefined();
  });
});
