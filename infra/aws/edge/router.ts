/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **One origin for the browser, and that is what makes the session work.**
 *
 * `apps/web` holds its own Better Auth and signs the cookie; `apps/posts-api` resolves that same
 * cookie against the same row. Put them on two domains and the cookie needs a domain, a SameSite
 * policy and a CORS list that all have to agree; put them behind one router and the browser simply
 * never leaves the origin it logged in on.
 *
 * It is created here, with no routes, because the routes point at things that need this router's URL
 * to be configured — the same shape `messaging/` has, where the topic and the queues exist before
 * anything binds them together.
 */
export const router = new sst.aws.Router('Edge');
