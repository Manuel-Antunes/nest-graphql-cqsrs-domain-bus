import { Global, Module } from '@nestjs/common';

import { AgentCallers } from './agent-callers';

@Global()
@Module({
  providers: [AgentCallers],
  exports: [AgentCallers],
})
export class AgentCallersModule {}
