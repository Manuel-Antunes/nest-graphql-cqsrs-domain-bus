import type { IncomingMessage } from 'node:http';
import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import type { AttachmentContextData } from '../../domain/context/attachment-context-registry';
import { AttachmentContext } from './attachment-context';
import { AttachmentContextSource } from './attachment-context-source';

/**
 * Opens an {@link AttachmentContext} scope for every HTTP request, carrying its `x-tenant`. The
 * `AttachmentContextInterceptor` covers the transports a middleware does not run on.
 */
@Injectable()
export class AttachmentContextMiddleware implements NestMiddleware {
  use(req: IncomingMessage, _: unknown, next: (error?: unknown) => void) {
    return AttachmentContext.run(this.resolve(req), next);
  }

  /** What the request contributes to the scope. Override it to carry more than the tenant. */
  protected resolve(req: IncomingMessage): AttachmentContextData {
    return AttachmentContextSource.fromHeaders(req.headers);
  }
}
