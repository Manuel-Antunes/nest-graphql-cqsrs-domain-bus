/// <reference path="../../../.sst/platform/config.d.ts" />

import { AgentRuntime } from './agent-runtime';

sst.Linkable.wrap(aws.bedrock.AgentcoreGateway, (gateway) => ({
  properties: { url: gateway.gatewayUrl, arn: gateway.gatewayArn },
  include: [
    sst.aws.permission({
      actions: ['bedrock-agentcore:InvokeGateway'],
      resources: [gateway.gatewayArn],
    }),
  ],
}));

const region = aws.getRegionOutput().region;
const account = aws.getCallerIdentityOutput().accountId;

const webSearchRole = new aws.iam.Role('WebSearchRole', {
  assumeRolePolicy: $util.jsonStringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: AgentRuntime.SERVICE },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: { 'aws:SourceAccount': account },
          ArnLike: {
            'aws:SourceArn': $interpolate`arn:aws:bedrock-agentcore:${region}:${account}:gateway/*`,
          },
        },
      },
    ],
  }),
});

const webSearchPolicy = new aws.iam.RolePolicy('WebSearchPolicy', {
  role: webSearchRole.id,
  policy: $util.jsonStringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: 'bedrock-agentcore:InvokeGateway',
        Resource: $interpolate`arn:aws:bedrock-agentcore:${region}:${account}:gateway/*`,
      },
      {
        Effect: 'Allow',
        Action: 'bedrock-agentcore:InvokeWebSearch',
        Resource: $interpolate`arn:aws:bedrock-agentcore:${region}:aws:tool/web-search.v1`,
      },
    ],
  }),
});

export const webSearch = new aws.bedrock.AgentcoreGateway(
  'WebSearch',
  {
    name: `${$app.name}-${$app.stage}-web-search`,
    description: "AgentCore's web search, as an MCP tool for the agents",
    protocolType: 'MCP',
    authorizerType: 'AWS_IAM',
    roleArn: webSearchRole.arn,
  },
  { dependsOn: [webSearchPolicy] },
);

new aws.bedrock.AgentcoreGatewayTarget('WebSearchTarget', {
  gatewayIdentifier: webSearch.gatewayId,
  name: 'web-search',
  description: 'The AgentCore Web Search connector',
  targetConfiguration: {
    mcp: {
      connector: {
        source: { connectorId: 'web-search', version: '1.2.0' },
        configurations: [{ name: 'WebSearch', parameterValues: '{}' }],
      },
    },
  },
  credentialProviderConfiguration: { gatewayIamRole: {} },
});
