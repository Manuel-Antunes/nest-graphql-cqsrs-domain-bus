import { ChatBedrockConverse } from '@langchain/aws';
import { Module } from '@nestjs/common';

import type { BedrockConfig } from '../config/bedrock.config';
import { bedrockConfig } from '../config/bedrock.config';
import { PostsMcpTools } from '../mcp/posts-mcp-tools';
import { ConversationMemory } from '../memory/conversation-memory';
import { postsAgentA2a } from './posts-agent.a2a';
import { PostsManagerAgent } from './posts-manager.agent';

@Module({
  imports: [postsAgentA2a],
  providers: [
    {
      provide: ChatBedrockConverse,
      inject: [bedrockConfig.KEY],
      useFactory: ({ region, model, temperature }: BedrockConfig) =>
        new ChatBedrockConverse({
          region,
          model,
          ...(temperature === undefined ? {} : { temperature }),
        }),
    },
    { provide: 'BASE_MODEL', useExisting: ChatBedrockConverse },
    PostsMcpTools,
    ConversationMemory,
    PostsManagerAgent,
  ],
  exports: [PostsManagerAgent],
})
export class PostsManagerModule {}
