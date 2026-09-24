/// <reference path="../../../.sst/platform/config.d.ts" />

import { gateway, streaming } from '../compute';
import { router } from './router';

const originOf = (url: $util.Output<string>) =>
  url.apply((value) => value.replace(/\/$/, ''));

/**
 * `/graphql` is the federation gateway, `/api/auth` is Better Auth in the posts API, and the web
 * application is everything else. The subgraphs keep their own function URLs, which only the gateway
 * — and the web's federation page, playing the router on purpose — call directly.
 *
 * `readTimeout` is raised because a streamed GraphQL response — and an SSE subscription — outlives
 * CloudFront's default: the connection stays open precisely because there is more to come.
 */
router.route('/graphql', originOf(gateway.url), { readTimeout: '60 seconds' });

router.route('/api/auth', originOf(streaming.url), {
  readTimeout: '60 seconds',
});
