/// <reference path="../../../.sst/platform/config.d.ts" />

import { streaming } from '../compute';
import { router } from './router';

const origin = streaming.url.apply((url) => url.replace(/\/$/, ''));

/**
 * The API answers on two paths and the web application on everything else.
 *
 * `readTimeout` is raised because a streamed GraphQL response — and an SSE subscription, if one is
 * ever opened here — outlives CloudFront's default: the connection stays open precisely because
 * there is more to come.
 */
router.route('/graphql', origin, { readTimeout: '60 seconds' });

router.route('/api/auth', origin, { readTimeout: '60 seconds' });
