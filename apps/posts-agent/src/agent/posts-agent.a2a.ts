import { A2aModule } from '@nestposts/ai/a2a/server/a2a.module';

import { CallerModule } from '../caller/caller.module';
import { PlatformCallers } from '../caller/platform-callers';
import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';
import { PostsManagerAgent } from './posts-manager.agent';

export const postsAgentA2a = A2aModule.registerAsync({
  imports: [CallerModule],
  inject: [appConfig.KEY, PlatformCallers],
  useFactory: (app: AppConfig, callers: PlatformCallers) => ({
    baseUrl: app.url ?? `http://localhost:${app.port}/`,
    agentProviders: [PostsManagerAgent],
    resolveUser: (headers) => callers.resolve(headers),
  }),
});
