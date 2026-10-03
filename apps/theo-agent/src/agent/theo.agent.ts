import type { AbstractAgent } from '@ag-ui/client';
import { copilotkitMiddleware } from '@copilotkit/sdk-js/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';
import { RemoteA2aAgents } from '@nestposts/ai/a2a/client/remote-a2a-agents';
import { A2aMiddlewareAgent } from '@nestposts/ai/ag-ui/a2a/a2a-middleware.agent';
import { InProcessLangGraphClient } from '@nestposts/ai/ag-ui/langgraph/in-process-langgraph.client';
import { AgUiAgent } from '@nestposts/ai/ag-ui/server/ag-ui-agent.decorator';
import { AgentRunContext } from '@nestposts/ai/agents/context/agent-run-context';
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
    @Inject(WebSearchClient) private readonly webSearch: WebSearchClient | null,
    private readonly checkpointer: BaseCheckpointSaver,
    private readonly store: BaseStore,
    @Inject(ChatApi) private readonly chats: ChatApi | null,
  ) {}

  readonly agent = async (): Promise<AbstractAgent> => {
    const specialists = await RemoteA2aAgents.connect(
      this.agents.urls,
      AgentRunContext.bearerFetch(),
      { tenantOf: () => AgentRunContext.current()?.tenant ?? '' },
    );
    const graph = createAgent({
      model: this.model,
      tools: this.webSearch ? [WebSearchTool.create(this.webSearch)] : [],
      systemPrompt: TheoInstructions.with(specialists.roster(), {
        webSearch: this.webSearch !== null,
      }),
      middleware: [
        copilotkitMiddleware,
        ...(this.chats
          ? [
              ChatRecordingMiddleware.create({
                agentId: TheoAgent.AGENT_ID,
                chats: this.chats,
              }),
            ]
          : []),
        LongTermMemoryMiddleware.create({ recall: TheoAgent.RECALL }),
      ],
      checkpointer: this.checkpointer,
      store: this.store,
    });
    return new A2aMiddlewareAgent({
      orchestrator: InProcessLangGraphClient.agentOver(graph, {
        graphId: TheoAgent.AGENT_ID,
      }),
      agents: specialists,
      traceName: TheoAgent.AGENT_ID,
    });
  };
}
