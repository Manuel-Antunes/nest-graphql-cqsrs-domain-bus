import type { AbstractAgent } from '@ag-ui/client';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Inject, Injectable } from '@nestjs/common';
import { A2aDelegationTool } from '@nestposts/ai/a2a/client/a2a-delegation.tool';
import { RemoteA2aAgents } from '@nestposts/ai/a2a/client/remote-a2a-agents';
import { AgUiMiddleware } from '@nestposts/ai/ag-ui/langchain/ag-ui.middleware';
import { LangChainAgUiAgent } from '@nestposts/ai/ag-ui/langchain/langchain-ag-ui.agent';
import { AgUiAgent } from '@nestposts/ai/ag-ui/server/ag-ui-agent.decorator';
import { AgentCallers } from '@nestposts/ai/agents/callers/agent-callers';
import { CallerBearerFetch } from '@nestposts/ai/agents/callers/caller-bearer.fetch';
import { createAgent } from 'langchain';

import type { AgentsConfig } from '../config/agents.config';
import { agentsConfig } from '../config/agents.config';
import { TheoInstructions } from './theo.instructions';

@AgUiAgent({
  id: 'theo',
  name: 'Theo',
  description:
    "The platform's assistant: it talks with the person signed in and hands what concerns posts to the posts agent, over A2A, as that person.",
})
@Injectable()
export class TheoAgent implements AgUiAgent {
  constructor(
    @Inject('BASE_MODEL') private readonly model: BaseChatModel,
    @Inject(agentsConfig.KEY) private readonly agents: AgentsConfig,
    private readonly callers: AgentCallers,
  ) {}

  readonly agent = async (): Promise<AbstractAgent> => {
    const specialists = await RemoteA2aAgents.connect(
      this.agents.urls,
      CallerBearerFetch.of(this.callers),
    );
    return new LangChainAgUiAgent({
      graph: createAgent({
        model: this.model,
        tools: [A2aDelegationTool.create(specialists)],
        systemPrompt: TheoInstructions.with(specialists.roster()),
        middleware: [AgUiMiddleware.create()],
      }),
      traceName: 'theo',
      userOf: () => this.callers.current()?.userName,
    });
  };
}
