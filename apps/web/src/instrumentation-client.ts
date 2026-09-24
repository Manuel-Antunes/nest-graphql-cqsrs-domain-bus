import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  sendClientReports: false,
  dataCollection: { userInfo: false },
  integrations: (defaults) =>
    defaults.filter(({ name }) => name !== 'BrowserSession'),
});
