import * as Sentry from '@sentry/nextjs';

import { env } from '@/env.mjs';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: env.NEXT_PUBLIC_SENTRY_RELEASE,
  sendClientReports: false,
  dataCollection: { userInfo: false },
  integrations: (defaults) =>
    defaults.filter(({ name }) => name !== 'BrowserSession'),
});
