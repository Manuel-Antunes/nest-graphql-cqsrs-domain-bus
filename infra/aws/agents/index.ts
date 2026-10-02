/// <reference path="../../../.sst/platform/config.d.ts" />

import { gateway, streaming } from '../compute';
import { build } from '../compute/build';
import {
  authSecret,
  gatewayUrl,
  mcpResource,
  postsAgentResource,
  theoResource,
} from '../compute/environment';
import { cache, database, postgresUrl, redisUrl } from '../data';
import { router } from '../edge/router';
import { vpc } from '../network';
import { AgentRuntime } from './agent-runtime';
import { webSearch } from './web-search';

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

const discoveryUrl = $interpolate`${router.url}/.well-known/openid-configuration`;

export const postsMcp = new AgentRuntime('PostsMcp', {
  protocol: 'MCP',
  dockerfile: 'apps/mcp/Dockerfile',
  dependsOn: [build, gateway, streaming],
  authorizer: { discoveryUrl, audiences: [mcpResource] },
  headers: ['X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App'],
  environment: {
    AUTH_ISSUER: router.url,
    POSTS_MCP_RESOURCE: mcpResource,
    POSTS_MCP_GRAPHQL_ENDPOINT: gatewayUrl,
  },
});

export const postsAgentMemory = new aws.bedrock.AgentcoreMemory(
  'PostsAgentMemory',
  {
    name: AgentRuntime.nameOf('PostsAgentMemory'),
    description: 'The conversations people had with the posts agent',
    eventExpiryDuration: 30,
  },
);

export const agentModel = 'global.anthropic.claude-sonnet-5-5';

export const theoModel = 'us.amazon.nova-2-lite-v1:0';

const invokeModels = {
  actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
  resources: [
    'arn:aws:bedrock:*::foundation-model/*',
    'arn:aws:bedrock:*:*:inference-profile/*',
  ],
};

export const postsAgent = new AgentRuntime('PostsAgent', {
  protocol: 'A2A',
  context: 'apps/posts-agent',
  dockerfile: 'apps/posts-agent/Dockerfile',
  dependsOn: [build, gateway, streaming],
  authorizer: { discoveryUrl, audiences: [postsAgentResource] },
  headers: ['A2A-Version', 'A2A-Extensions'],
  vpc,
  link: [postsMcp, postsAgentMemory, database, cache, authSecret],
  environment: {
    POSTGRES_URL: postgresUrl,
    REDIS_URL: redisUrl,
    AUTH_SECRET: authSecret.value,
    AUTH_URL: router.url,
    WEB_URL: router.url,
    AUTH_ISSUER: router.url,
    AUTH_OAUTH_RESOURCES: postsAgentResource,
    POSTS_AGENT_RESOURCE: postsAgentResource,
    POSTS_MCP_URL: postsMcp.url,
    POSTS_AGENT_MODEL_ID: agentModel,
    BEDROCK_AGENTCORE_MEMORY_ID: postsAgentMemory.id,
    LOG_LEVEL: 'info',
  },
  permissions: [invokeModels],
});

export const theo = new AgentRuntime('Theo', {
  protocol: 'AGUI',
  context: 'apps/theo-agent',
  dockerfile: 'apps/theo-agent/Dockerfile',
  dependsOn: [build, gateway, streaming],
  authorizer: { discoveryUrl, audiences: [theoResource] },
  vpc,
  link: [postsAgent, webSearch, database, cache, authSecret],
  environment: {
    POSTGRES_URL: postgresUrl,
    REDIS_URL: redisUrl,
    AUTH_SECRET: authSecret.value,
    AUTH_URL: router.url,
    WEB_URL: router.url,
    AUTH_ISSUER: router.url,
    AUTH_OAUTH_RESOURCES: theoResource,
    THEO_A2A_AGENTS: postsAgent.url,
    THEO_AGENT_MODEL_ID: theoModel,
    THEO_WEB_SEARCH_URL: webSearch.gatewayUrl,
    LOG_LEVEL: 'info',
  },
  permissions: [invokeModels],
});
