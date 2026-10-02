import { ChatBedrockConverse } from '@langchain/aws';
import { Module } from '@nestjs/common';
import { WebSearchClient } from 'bedrock-agentcore/web-search';

import type { BedrockConfig } from '../config/bedrock.config';
import { bedrockConfig } from '../config/bedrock.config';
import type { WebSearchConfig } from '../config/web-search.config';
import { webSearchConfig } from '../config/web-search.config';
import { TheoAgent } from './theo.agent';

@Module({
  imports: [],
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
    {
      provide: WebSearchClient,
      inject: [webSearchConfig.KEY, bedrockConfig.KEY],
      useFactory: ({ url }: WebSearchConfig, { region }: BedrockConfig) =>
        url ? new WebSearchClient({ region, gatewayEndpoint: url }) : null,
    },
    TheoAgent,
  ],
  exports: [TheoAgent],
})
export class TheoModule {}
