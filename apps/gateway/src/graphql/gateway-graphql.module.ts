import { Module } from '@nestjs/common';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';

import { SupergraphModule } from '../supergraph/supergraph.module';
import { OrganizationSlugs } from './organization-slugs';

@Module({
  imports: [SupergraphModule, OrganizationsInfrastructureModule],
  providers: [OrganizationSlugs],
  exports: [SupergraphModule, OrganizationSlugs],
})
export class GatewayGraphQLModule {}
