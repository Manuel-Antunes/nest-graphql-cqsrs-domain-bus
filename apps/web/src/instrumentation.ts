import type { Instrumentation } from 'next';
import * as Sentry from '@sentry/nextjs';

const FLUSH_TIMEOUT_MS = 2_000;

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge');
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...request
) => {
  Sentry.captureRequestError(...request);
  if (process.env.LAMBDA_TASK_ROOT) {
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  }
};
