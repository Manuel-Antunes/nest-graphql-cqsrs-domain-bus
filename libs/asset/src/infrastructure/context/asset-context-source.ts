import type { ExecutionContext } from '@nestjs/common';
import { ROOT_TENANT, TENANT_HEADER } from '@nestposts/database';

import type { AssetContextData } from '../../domain/context/asset-context-registry';

type Headers = Record<string, string | string[] | undefined> | undefined;

type RpcContext = {
  mcpRequest?: { params?: { _meta?: { tenantId?: unknown } } };
} & Record<string, unknown>;

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const headerValue = (headers: Headers, name: string): string | undefined => {
  const raw = headers?.[name];
  return nonEmpty(Array.isArray(raw) ? raw[0] : raw);
};

export function assetContextFromHeaders(headers: Headers): AssetContextData {
  return { tenantId: headerValue(headers, TENANT_HEADER) ?? ROOT_TENANT };
}

export function assetContextFromExecutionContext(
  context: ExecutionContext,
): AssetContextData {
  if (context.getType() === 'rpc') {
    const rpc = context.switchToRpc().getContext<RpcContext>();
    const tenantId =
      nonEmpty(rpc?.mcpRequest?.params?._meta?.tenantId) ??
      nonEmpty(rpc?.[TENANT_HEADER]) ??
      ROOT_TENANT;
    return { tenantId };
  }

  const request = context.switchToHttp().getRequest<{ headers?: Headers }>();
  return assetContextFromHeaders(request?.headers);
}
