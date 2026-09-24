/**
 * **The doubles, behind a subpath of their own** — `@nestposts/transport-eventbus/testing`.
 *
 * They are not in the main barrel, and the reason is concrete: `startInProcessService` needs
 * `@nestposts/database/testing`, which needs Testcontainers, which needs `dockerode`, which needs
 * `ssh2`. Exported from the root, every production bundle dragged that along — and on Lambda it
 * announced itself as `Runtime.ImportModuleError: Cannot find module 'ssh2'`, from an application
 * that has nothing to do with Docker.
 *
 * `MemoryClient` stays in the main barrel on purpose: it is a **transport**, not a double. An
 * application runs on it with `POSTS_TRANSPORT=memory`, and it depends on nothing but Nest.
 */
export * from './in-process-service';
export * from './recording-client';
