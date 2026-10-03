import { Controller, Get, Header, Inject } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';
import { DISCOVERY_CACHE_CONTROL } from './discovery-cache';

/**
 * **Where a client discovers this authorization server**: RFC 8414's
 * `/.well-known/oauth-authorization-server` and OpenID Connect's `/.well-known/openid-configuration`,
 * at the root of the origin — the issuer has no path.
 *
 * `@better-auth/oauth-provider` answers both itself, but only for a request that reaches Better
 * Auth's handler, and that handler is mounted under `/api/auth`. These are the plugin's own
 * documents, served where an MCP server or a JWT authorizer looks for them: the `issuer`, the
 * `jwks_uri` and the endpoints inside are the plugin's, never written here.
 */
@Controller('.well-known')
@AllowAnonymous()
export class OAuthDiscoveryController {
  constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuth) {}

  @Get('oauth-authorization-server')
  @Header('Cache-Control', DISCOVERY_CACHE_CONTROL)
  authorizationServer(): Promise<unknown> {
    return this.auth.api.getOAuthServerConfig({});
  }

  @Get('openid-configuration')
  @Header('Cache-Control', DISCOVERY_CACHE_CONTROL)
  openIdConfiguration(): Promise<unknown> {
    return this.auth.api.getOpenIdConfig({});
  }
}
