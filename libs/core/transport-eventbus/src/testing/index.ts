/**
 * **The doubles, behind a subpath of their own** — `@nestposts/transport-eventbus/testing`.
 *
 * They are not in the main barrel because a production bundle must not carry `@nestjs/testing` — and
 * because, when `startInProcessService` still made a spec's schema itself, it dragged Testcontainers,
 * `dockerode` and `ssh2` along, which on Lambda announced itself as
 * `Runtime.ImportModuleError: Cannot find module 'ssh2'`. A spec now hands it the schema's lifecycle.
 */
export * from './in-process-packet';
export * from './in-process-service';
export * from './published-envelope';
export * from './recording-client';
