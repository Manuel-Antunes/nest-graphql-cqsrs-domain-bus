import { Module } from '@nestjs/common';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';

import { PlatformAgentContexts } from './platform-agent-contexts';

@Module({
  imports: [OrganizationsInfrastructureModule],
  providers: [PlatformAgentContexts],
  exports: [PlatformAgentContexts],
})
export class AgentContextsModule {}
