import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { registerOTel } from '@vercel/otel';

import { API_URL, GRAPHQL_UPSTREAM } from '@/lib/env';
import { FlushAtRequestEnd } from '@/lib/flush-at-request-end';

registerOTel({
  serviceName: 'nestposts-web',
  spanProcessors: ['auto', new FlushAtRequestEnd()],
  propagators: ['auto'],
  instrumentationConfig: {
    fetch: {
      propagateContextUrls: [
        GRAPHQL_UPSTREAM,
        API_URL,
        /lambda-url\..*\.on\.aws/,
        /execute-api\..*\.amazonaws\.com/,
      ],
    },
  },
  instrumentations: [
    'fetch',
    new GraphQLInstrumentation({
      allowValues: false,
      ignoreTrivialResolveSpans: true,
    }),
  ],
});
