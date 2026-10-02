import { Module } from '@nestjs/common';

import { PlatformCallers } from './platform-callers';

@Module({
  providers: [PlatformCallers],
  exports: [PlatformCallers],
})
export class PlatformCallersModule {}
