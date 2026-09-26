import type { ExecutionContext } from '@nestjs/common';
import { ROOT_TENANT, TENANT_HEADER } from '@nestposts/database';

import type { AttachmentContextData } from '../../domain/context/attachment-context-registry';

type Headers = Record<string, string | string[] | undefined> | undefined;

/** What a call contributes to the ambient context: the tenant it names, or the root one. */
export class AttachmentContextSource {
  static fromHeaders(headers: Headers): AttachmentContextData {
    const raw = headers?.[TENANT_HEADER];
    return {
      tenantId:
        AttachmentContextSource.nonEmpty(Array.isArray(raw) ? raw[0] : raw) ??
        ROOT_TENANT,
    };
  }

  static fromExecutionContext(
    context: ExecutionContext,
  ): AttachmentContextData {
    if (context.getType() === 'rpc') {
      const rpc = context.switchToRpc().getContext<Record<string, unknown>>();
      return {
        tenantId:
          AttachmentContextSource.nonEmpty(rpc?.[TENANT_HEADER]) ?? ROOT_TENANT,
      };
    }
    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Headers } | undefined>();
    return AttachmentContextSource.fromHeaders(request?.headers);
  }

  private static nonEmpty(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
  }
}
