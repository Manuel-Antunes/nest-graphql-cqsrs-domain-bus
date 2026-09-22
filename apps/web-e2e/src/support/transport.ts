export type E2eTransport = 'inngest' | 'rabbitmq';

/**
 * **Which transport this run drives the system over.** Inngest is the default, because it is what a
 * developer gets by default; `E2E_TRANSPORT=rabbitmq` is the other run, and `pnpm test:web` does both.
 *
 * What is true on one is asserted on both — the saga closes, the read model reaches version 2, the
 * tenant crosses two processes. What only a broker has stays in the run that has one.
 */
export const e2eTransport = (): E2eTransport =>
  process.env.E2E_TRANSPORT === 'rabbitmq' ? 'rabbitmq' : 'inngest';
