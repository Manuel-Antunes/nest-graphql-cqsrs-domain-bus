import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { OrganizationsInfrastructureModule } from '../organizations-infrastructure.module';
import { TenantMembershipGuard } from './tenant-membership.guard';

/**
 * The membership rule, applied to every request of the application that imports it — see
 * {@link TenantMembershipGuard}. A subgraph imports it; a process that serves no caller does not.
 */
@Module({
  imports: [OrganizationsInfrastructureModule],
  providers: [{ provide: APP_GUARD, useClass: TenantMembershipGuard }],
})
export class TenantMembershipModule {}
