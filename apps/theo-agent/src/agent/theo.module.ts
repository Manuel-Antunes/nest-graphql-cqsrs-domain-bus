import { ChatBedrockConverse } from '@langchain/aws';
import { Module } from '@nestjs/common';

import type { BedrockConfig } from '../config/bedrock.config';
import { bedrockConfig } from '../config/bedrock.config';
import { TheoAgent } from './theo.agent';
import { theoAgUi } from './theo-agent.ag-ui';

@Module({
  imports: [theoAgUi],
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
    TheoAgent,
  ],
  exports: [TheoAgent],
})
export class TheoModule {}
