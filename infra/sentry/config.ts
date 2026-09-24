/**
 * Endpoint and credentials of the error tracker — a self-hosted **GlitchTip**, which speaks Sentry's
 * API and Sentry's SDK protocol — shared by the two things that talk to it: the `sentry` Pulumi
 * provider configured in `sst.config.ts` (team, projects, keys) and the `GlitchtipAlert` dynamic
 * provider in `./providers/alert.ts` (alerts, which GlitchTip exposes under an endpoint the Sentry
 * API does not have — see that file).
 *
 * Deliberately free of SST globals (`$app`, `$util`, `sentry`): `sst.config.ts` reads this from
 * inside `app()`, which runs before the Pulumi runtime exists.
 */

/** GlitchTip organization slug that owns every project in `./index.ts`. */
export const SENTRY_ORGANIZATION = 'vaz-innovation';

/**
 * **The one stage that creates and manages the projects, their keys and their alerts.** There is one
 * GlitchTip for the whole company and one project per application, so the projects cannot belong to
 * every stage: a second stage creating the same slug is a conflict. Every other stage only reads the
 * DSN, by the key's name (`./index.ts`), and reports under its own `environment`.
 */
export const SENTRY_OWNER_STAGE = 'dev';

/**
 * API root, **trailing slash included** — `terraform-provider-sentry` (which `@pulumiverse/sentry`
 * bridges) appends `0/organizations/...` to it verbatim, and so does the alert provider. The `.env`
 * may carry it without one, so it is added here rather than trusted.
 */
export const SENTRY_BASE_URL = (
  process.env.SENTRY_BASE_URL || 'https://sentry.vazinnovation.com/api/'
).replace(/\/?$/, '/');

/** Where a person opens an issue: the API root's host, without `/api/`. */
export const SENTRY_WEB_URL = SENTRY_BASE_URL.replace(/\/api\/$/, '');

/**
 * `SENTRY_TOKEN` first, `SENTRY_AUTH_TOKEN` second — the provider's own fallback, which Sentry's
 * build tooling also reads, so it is named here rather than picked up implicitly. Needs
 * organization-scoped `project:write` and `team:write`.
 */
export const SENTRY_TOKEN =
  process.env.SENTRY_TOKEN || process.env.SENTRY_AUTH_TOKEN || '';
