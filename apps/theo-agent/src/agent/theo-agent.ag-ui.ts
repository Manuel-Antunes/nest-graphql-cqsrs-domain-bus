import { AgUiModule } from '@nestposts/ai/ag-ui/server/ag-ui.module';
import { PlatformCallers } from '@nestposts/ai/agents/callers/platform-callers';
import { PlatformCallersModule } from '@nestposts/ai/agents/callers/platform-callers.module';

import { TheoAgent } from './theo.agent';

export const theoAgUi = AgUiModule.registerAsync({
  imports: [PlatformCallersModule],
  inject: [PlatformCallers],
  useFactory: (callers: PlatformCallers) => ({
    agentProviders: [TheoAgent],
    resolveUser: (headers) => callers.resolve(headers),
  }),
});
