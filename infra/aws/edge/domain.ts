/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * **The stage's own domain, when it has one** — `BASE_DOMAIN` and `CLOUDFLARE_ZONE_ID` from the
 * `.env` at the root. Without them the stage is what it always was, one CloudFront URL; with them
 * the router answers on `app.<BASE_DOMAIN>` (production) or `<stage>.<BASE_DOMAIN>`, and nothing
 * else changes: every route, Chatwoot's included, stays on that one origin.
 */
const BASE_DOMAIN = process.env.BASE_DOMAIN?.trim() || undefined;

const zoneOf = (baseDomain: string): string => {
  const zone = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (!zone) {
    throw new Error(
      `BASE_DOMAIN is ${baseDomain} but CLOUDFLARE_ZONE_ID is not set. The records are created in ` +
        'that Cloudflare zone, with CLOUDFLARE_API_TOKEN — both from the .env at the root.',
    );
  }
  return zone;
};

export const stageDomain = BASE_DOMAIN
  ? `${$app.stage === 'production' ? 'app' : $app.stage}.${BASE_DOMAIN}`
  : undefined;

export const dns = BASE_DOMAIN
  ? sst.cloudflare.dns({ zone: zoneOf(BASE_DOMAIN) })
  : undefined;
