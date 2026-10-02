import { Module } from '@nestjs/common';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';

import { PlatformCallers } from './platform-callers';

@Module({
  imports: [OrganizationsInfrastructureModule],
  providers: [PlatformCallers],
  exports: [PlatformCallers],
})
export class PlatformCallersModule {}
