import { Inngest } from 'inngest';

export const INNGEST_DEFAULT_BASE_URL = 'http://localhost:8288';

/**
 * **The Inngest client an application sends and serves through** — one per service, and the same
 * object on both halves: {@link InngestClientProxy} sends on it and {@link InngestStrategy} creates
 * its functions on it, which is what makes the app id in the dashboard the service's own name.
 *
 * `isDev` is on unless `INNGEST_DEV=false`, because this is the transport a developer gets by
 * default and the dev server is what answers on a laptop. A deployed one turns it off and brings its
 * own `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
 */
export const inngestApp = (id: string): Inngest.Any =>
  new Inngest({
    id,
    isDev: process.env.INNGEST_DEV !== 'false',
    baseUrl: process.env.INNGEST_BASE_URL ?? INNGEST_DEFAULT_BASE_URL,
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
  }) as Inngest.Any;
