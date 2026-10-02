import type { AbstractAgent } from '@ag-ui/client';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';
import { A2aDelegationTool } from '@nestposts/ai/a2a/client/a2a-delegation.tool';
import { RemoteA2aAgents } from '@nestposts/ai/a2a/client/remote-a2a-agents';
import { A2aTenancy } from '@nestposts/ai/a2a/server/a2a-tenancy';
import { AgUiMiddleware } from '@nestposts/ai/ag-ui/langchain/ag-ui.middleware';
import { LangChainAgUiAgent } from '@nestposts/ai/ag-ui/langchain/langchain-ag-ui.agent';
import { AgUiAgent } from '@nestposts/ai/ag-ui/server/ag-ui-agent.decorator';
import { AgentCallers } from '@nestposts/ai/agents/callers/agent-callers';
import { CallerBearerFetch } from '@nestposts/ai/agents/callers/caller-bearer.fetch';
import { ChatApi } from '@nestposts/ai/chats/chat-api';
import { ChatRecordingMiddleware } from '@nestposts/ai/chats/chat-recording.middleware';
import { LongTermMemoryMiddleware } from '@nestposts/ai/middleware/long-term-memory.middleware';
import { WebSearchTool } from '@nestposts/ai/web/web-search.tool';
import { WebSearchClient } from 'bedrock-agentcore/web-search';
import { createAgent } from 'langchain';

import type { AgentsConfig } from '../config/agents.config';
import { agentsConfig } from '../config/agents.config';
import { TheoInstructions } from './theo.instructions';

@AgUiAgent({
  id: 'theo',
  name: 'Theo',
  description:
    "The platform's assistant: it talks with the person signed in, searches the web, and hands what concerns posts to the posts agent, over A2A, as that person.",
})
@Injectable()
export class TheoAgent implements AgUiAgent {
  static readonly AGENT_ID = 'theo';
  static readonly RECALL = ['preferences', 'facts'] as const;

  constructor(
    @Inject('BASE_MODEL') private readonly model: BaseChatModel,
    @Inject(agentsConfig.KEY) private readonly agents: AgentsConfig,
    private readonly callers: AgentCallers,
    @Inject(WebSearchClient) private readonly webSearch: WebSearchClient | null,
    private readonly checkpointer: BaseCheckpointSaver,
    private readonly store: BaseStore,
    @Inject(ChatApi) private readonly chats: ChatApi | null,
  ) {}

  readonly agent = async (): Promise<AbstractAgent> => {
    const specialists = await RemoteA2aAgents.connect(
      this.agents.urls,
      CallerBearerFetch.of(this.callers),
      { tenantOf: () => A2aTenancy.tenantOf(this.callers.current()) },
    );
    return new LangChainAgUiAgent({
      graph: createAgent({
        model: this.model,
        tools: [
          A2aDelegationTool.create(specialists),
          ...(this.webSearch ? [WebSearchTool.create(this.webSearch)] : []),
        ],
        systemPrompt: TheoInstructions.with(specialists.roster(), {
          webSearch: this.webSearch !== null,
        }),
        middleware: [
          AgUiMiddleware.create(),
          ...(this.chats
            ? [
                ChatRecordingMiddleware.create({
                  agentId: TheoAgent.AGENT_ID,
                  chats: this.chats,
                  callers: this.callers,
                }),
              ]
            : []),
          LongTermMemoryMiddleware.create({ recall: TheoAgent.RECALL }),
        ],
        checkpointer: this.checkpointer,
        store: this.store,
      }),
      traceName: 'theo',
      callerOf: () => this.callers.current(),
    });
  };
}
