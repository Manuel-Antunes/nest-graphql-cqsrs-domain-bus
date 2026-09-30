import { AsyncContext } from '@nestjs/cqrs';
import type { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import { ROOT_TENANT, TENANT_HEADER } from '@nestposts/database';
import type { ContextAttributes } from '@nestposts/transport-eventbus';

export class ClientRequest extends AsyncContext implements ContextAttributes {
  constructor(
    readonly clientId: ClientId,
    readonly tenantId: string = ROOT_TENANT,
  ) {
    super();
  }

  toAttributes(): Record<string, string> {
    return { [TENANT_HEADER]: this.tenantId };
  }
}
