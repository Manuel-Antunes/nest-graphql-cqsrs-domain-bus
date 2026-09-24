/**
 * The integrations Sentry turns on by default that this setup turns off. `ProcessSession` reports
 * release health, which GlitchTip does not keep. The framework integrations capture a 5xx from the
 * HTTP server on their own, beside the report the application already makes: with them on, one
 * failure is two issues.
 */
const UNUSED_INTEGRATIONS = new Set([
  'ProcessSession',
  'Express',
  'Fastify',
  'Hapi',
  'Koa',
]);

/**
 * Credentials never leave the process. The gateway forwards every caller's cookie and bearer to
 * each subgraph, so a request's headers are a working session in whatever stores them — the same
 * reason the request log redacts them.
 */
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'set-cookie'];

export interface ErrorReportingOptions {
  /** Tagged `service` on every report, so one project can tell two deployables apart. */
  readonly serviceName: string;
  /** Where the reports go. `SENTRY_DSN` when omitted; with neither, nothing is reported. */
  readonly dsn?: string;
  /** `SENTRY_ENVIRONMENT` when omitted, then `NODE_ENV`. */
  readonly environment?: string;
  /** `SENTRY_RELEASE` when omitted. */
  readonly release?: string;
}

/**
 * **The one configuration every server-side Sentry SDK here starts with** — the Nest one
 * (`startErrorReporting`) and the Next one (`apps/web`'s `sentry.server.config.ts`), handed the
 * SDK's own `openTelemetryIntegration`.
 *
 * OpenTelemetry owns tracing, so Sentry's own setup stays off (`enableOpenTelemetrySetup: false`,
 * no `tracesSampleRate`): it opens no spans and patches no module. `openTelemetryIntegration` stamps
 * every report with the trace and span active when it is captured — the `trace_id` the spans and
 * the log lines already carry, so an issue opens straight onto its trace.
 *
 * It propagates nothing either (`tracePropagationTargets: []`). Left on, the SDK adds `sentry-trace`
 * and a `sentry-*` `baggage` to every outgoing request, with a trace id of its own beside the
 * `traceparent` — measured on the web, whose fetches carried both to the gateway and on to posts-api.
 *
 * It imports no SDK, so the web can read it without loading the Nest one.
 */
export const errorReportingOptions = <OpenTelemetry extends { name: string }>(
  options: ErrorReportingOptions & {
    readonly openTelemetryIntegration: () => OpenTelemetry;
  },
) => ({
  dsn: options.dsn ?? process.env.SENTRY_DSN,
  environment:
    options.environment ??
    process.env.SENTRY_ENVIRONMENT ??
    process.env.NODE_ENV,
  release: options.release ?? process.env.SENTRY_RELEASE,
  initialScope: { tags: { service: options.serviceName } },
  enableOpenTelemetrySetup: false,
  tracePropagationTargets: [],
  sendClientReports: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { deny: CREDENTIAL_HEADERS },
      response: { deny: CREDENTIAL_HEADERS },
    },
  },
  integrations: <Integration extends { name: string }>(
    defaults: Integration[],
  ): (Integration | OpenTelemetry)[] => [
    ...defaults.filter(({ name }) => !UNUSED_INTEGRATIONS.has(name)),
    options.openTelemetryIntegration(),
  ],
});
