import { A2aModule } from '@nestposts/ai/a2a/server/a2a.module';
import { PlatformCallers } from '@nestposts/ai/agents/callers/platform-callers';
import { PlatformCallersModule } from '@nestposts/ai/agents/callers/platform-callers.module';

import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';
import { PostsManagerAgent } from './posts-manager.agent';

export const postsAgentA2a = A2aModule.registerAsync({
  imports: [PlatformCallersModule],
  inject: [appConfig.KEY, PlatformCallers],
  useFactory: (app: AppConfig, callers: PlatformCallers) => ({
    baseUrl: app.url ?? `http://localhost:${app.port}/`,
    agentProviders: [PostsManagerAgent],
    resolveUser: (headers) => callers.resolve(headers),
  }),
});
