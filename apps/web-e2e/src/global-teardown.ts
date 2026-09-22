import { RunningStack } from './support/running-stack';

/**
 * `E2E_KEEP_STACK=1` leaves everything running, which is the only way to ask the broker, the dev
 * server or a database what it thinks after a failure — by the time a report is written, a torn-down
 * stack has taken the answer with it. Containers are then cleaned up by hand, or by Testcontainers'
 * reaper when the session ends.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_KEEP_STACK === '1') {
    process.stdout.write('### E2E_KEEP_STACK=1: a stack fica de pé\n');
    return;
  }
  await RunningStack.down();
}
