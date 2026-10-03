/// <reference path="../../../.sst/platform/config.d.ts" />

import { AgentRuntime } from './agent-runtime';

sst.Linkable.wrap(aws.bedrock.AgentcoreMemory, (memory) => ({
  properties: { id: memory.id, arn: memory.arn },
  include: [
    sst.aws.permission({
      actions: [
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:GetEvent',
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:DeleteEvent',
        'bedrock-agentcore:ListSessions',
        'bedrock-agentcore:ListActors',
        'bedrock-agentcore:RetrieveMemoryRecords',
        'bedrock-agentcore:ListMemoryRecords',
        'bedrock-agentcore:GetMemoryRecord',
      ],
      resources: [memory.arn],
    }),
  ],
}));

/**
 * **An agent's AgentCore Memory, both halves of it.** Short-term: the agent's LangGraph checkpoints,
 * every thread a session of the actor `tenant:user` — `AgentCoreMemorySaver`
 * (`libs/core/langgraph-checkpoint-aws`). Long-term: the conversation the agent puts into the store
 * (`AgentCoreMemoryStore`), which these strategies turn, in the background, into records the agent
 * searches the next time — the person's preferences, the facts they told it, and a summary of each
 * conversation — under the same actor, so nothing extracted in one organization is recalled in
 * another.
 */
const agentMemory = (name: string, description: string, expiryDays: number) => {
  const memory = new aws.bedrock.AgentcoreMemory(name, {
    name: AgentRuntime.nameOf(name),
    description,
    eventExpiryDuration: expiryDays,
  });
  for (const [strategy, type, template] of [
    ['preferences', 'USER_PREFERENCE', '/preferences/{actorId}'],
    ['facts', 'SEMANTIC', '/facts/{actorId}'],
    ['summaries', 'SUMMARIZATION', '/summaries/{actorId}/{sessionId}'],
  ] as const) {
    new aws.bedrock.AgentcoreMemoryStrategy(`${name}${strategy}`, {
      memoryId: memory.id,
      name: strategy,
      type,
      namespaceTemplates: [template],
    });
  }
  return memory;
};

export const postsAgentMemory = agentMemory(
  'PostsAgentMemory',
  'The conversations people had with the posts agent',
  30,
);

export const theoMemory = agentMemory(
  'TheoMemory',
  'The conversations people had with Theo, one session each, in the organization they had them in',
  90,
);
