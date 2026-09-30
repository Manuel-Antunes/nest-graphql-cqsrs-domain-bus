import { Injectable } from '@nestjs/common';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { RequestCredentials } from '@nestposts/auth/infrastructure/request/request-credentials';
import { RequestHeaders } from '@nestposts/auth/infrastructure/request/request-headers';
import { TENANT_HEADER } from '@nestposts/database';

import { OrganizationSlugs } from './organization-slugs';
import type {
  SubgraphHeaderResolver,
  SubgraphHeaders,
} from './subgraph.header-resolver';

@Injectable()
export class DefaultSubgraphHeaderResolver implements SubgraphHeaderResolver {
  constructor(protected readonly organizations: OrganizationSlugs) {}

  async resolve(
    identity: Identity | null,
    req: unknown,
  ): Promise<SubgraphHeaders> {
    const tenant =
      RequestHeaders.from(req).get(TENANT_HEADER) ??
      (await this.organizations.of(identity?.activeOrganizationId));
    return {
      ...RequestCredentials.of(req).toHeaders(),
      ...(tenant && { [TENANT_HEADER]: tenant }),
    };
  }
}
