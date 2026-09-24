import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AssetContextData } from '../../domain/context/asset-context-registry';
import { AssetContext } from '../context/asset-context';
import { assetContextFromHeaders } from '../context/asset-context-source';

/**
 * Opens an {@link AssetContext} scope for every HTTP request, carrying its `x-tenant`. The
 * `AssetContextInterceptor` covers the transports a middleware does not run on.
 */
@Injectable()
export class AssetContextMiddleware implements NestMiddleware {
  use(
    req: FastifyRequest['raw'],
    _: FastifyReply['raw'],
    next: (error?: unknown) => void,
  ) {
    return AssetContext.run(this.resolve(req), next);
  }

  /** What the request contributes to the scope. Override it to carry more than the tenant. */
  protected resolve(req: FastifyRequest['raw']): AssetContextData {
    return assetContextFromHeaders(req.headers);
  }
}
