import { Module } from '@nestjs/common';

import { SupergraphModule } from '../supergraph/supergraph.module';

@Module({
  imports: [SupergraphModule],
  exports: [SupergraphModule],
})
export class GatewayGraphQLModule {}
