import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { registerOTel } from '@vercel/otel';

import { env } from '@/env.mjs';
import { FlushAtRequestEnd } from '@/lib/flush-at-request-end';

registerOTel({
  serviceName: 'nestposts-web',
  spanProcessors: ['auto', new FlushAtRequestEnd()],
  propagators: ['auto'],
  instrumentationConfig: {
    fetch: {
      propagateContextUrls: [
        env.NEXT_PUBLIC_GATEWAY_URL,
        env.NEXT_PUBLIC_API_URL,
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
