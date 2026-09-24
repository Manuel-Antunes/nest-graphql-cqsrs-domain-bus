/**
 * **observability** — the one door to the OpenTelemetry SDK, as `@nestposts/database` is the one
 * door to MikroORM.
 *
 * What lives here is the **bootstrap**: the SDK, the exporter, the list of instrumentations and the
 * flush a Lambda needs. What does not is propagation — carrying a trace across the wire is
 * `@nestposts/transport-eventbus`'s, and it does it through `@opentelemetry/api` alone, which is a
 * no-op until something here has started. That split is why a library never depends on this package
 * and an application always does.
 */
export * from './logging';
export * from './telemetry';
