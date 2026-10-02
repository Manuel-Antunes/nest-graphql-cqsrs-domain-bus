/// <reference path="../../../.sst/platform/config.d.ts" />

import { join } from 'node:path';

export type AgentRuntimeProtocol = 'HTTP' | 'MCP' | 'A2A' | 'AGUI';

export interface AgentRuntimeAuthorizer {
  readonly discoveryUrl: $util.Input<string>;
  readonly audiences: $util.Input<string>[];
}

type ElementOf<T> = T extends readonly (infer Element)[] ? Element : never;

export type AgentRuntimePermission = ElementOf<
  NonNullable<sst.aws.FunctionArgs['permissions']>
>;

export interface AgentRuntimeArgs {
  readonly protocol: AgentRuntimeProtocol;
  readonly dockerfile: string;
  readonly context?: string;
  readonly authorizer: AgentRuntimeAuthorizer;
  readonly vpc?: sst.aws.Vpc;
  readonly link?: sst.aws.FunctionArgs['link'];
  readonly permissions?: sst.aws.FunctionArgs['permissions'];
  readonly environment?: Record<string, $util.Input<string>>;
  readonly headers?: readonly string[];
  readonly dependsOn?: $util.Input<$util.Resource>[];
}

interface AgentRuntimeRef {
  readonly ref: true;
  readonly agentRuntimeId: $util.Input<string>;
}

interface AgentRuntimeLinkable {
  getSSTLink(): { include?: { type: string }[] };
}

interface AgentRuntimeNodes {
  readonly runtime: aws.bedrock.AgentcoreAgentRuntime;
  readonly role?: aws.iam.Role;
  readonly repository?: aws.ecr.Repository;
  readonly image?: dockerbuild.Image;
}

export class AgentRuntime extends $util.ComponentResource {
  static readonly __pulumiType = 'infra:aws:AgentRuntime';
  static readonly SERVICE = 'bedrock-agentcore.amazonaws.com';
  static readonly PLATFORM = 'linux/arm64';
  private static readonly NAME_LIMIT = 48;
  private static readonly KEPT_IMAGES = 10;
  private static readonly ISSUER_WARMUP = [
    'const answer = async (url) => {',
    '  for (let attempt = 0; attempt < 60; attempt += 1) {',
    '    try {',
    '      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });',
    '      if (response.ok) return response.json();',
    '    } catch {}',
    '    await new Promise((resolve) => setTimeout(resolve, 5000));',
    '  }',
    "  throw new Error(url + ' never answered');",
    '};',
    'answer(process.argv[1]).then((discovery) => answer(discovery.jwks_uri)).catch((failure) => {',
    '  console.error(failure.message);',
    '  process.exit(1);',
    '});',
  ].join('\n');

  private readonly built: AgentRuntimeNodes;

  constructor(
    name: string,
    args: AgentRuntimeArgs | AgentRuntimeRef,
    opts?: $util.ComponentResourceOptions,
  ) {
    super(AgentRuntime.__pulumiType, name, {}, opts);
    this.built =
      'ref' in args
        ? {
            runtime: aws.bedrock.AgentcoreAgentRuntime.get(
              `${name}Runtime`,
              args.agentRuntimeId,
              undefined,
              { parent: this },
            ),
          }
        : this.build(name, args);
    this.registerOutputs({ arn: this.arn, url: this.url });
  }

  static get(
    name: string,
    agentRuntimeId: $util.Input<string>,
    opts?: $util.ComponentResourceOptions,
  ): AgentRuntime {
    return new AgentRuntime(name, { ref: true, agentRuntimeId }, opts);
  }

  static nameOf(name: string): string {
    return `${$app.name}_${$app.stage}_${name}`
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[^a-zA-Z]+/, '')
      .slice(0, AgentRuntime.NAME_LIMIT);
  }

  static repositoryNameOf(name: string): string {
    return `${$app.name}-${$app.stage}-${name}`
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
  }

  static invocationUrlOf(
    arn: string,
    region: string,
    protocol: string,
  ): string {
    const base = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(arn)}/invocations`;
    return protocol === 'A2A' ? `${base}/` : `${base}?qualifier=DEFAULT`;
  }

  get nodes(): AgentRuntimeNodes {
    return this.built;
  }

  get id(): $util.Output<string> {
    return this.built.runtime.agentRuntimeId;
  }

  get arn(): $util.Output<string> {
    return this.built.runtime.agentRuntimeArn;
  }

  get protocol(): $util.Output<string> {
    return this.built.runtime.protocolConfiguration.apply(
      (configuration) => configuration?.serverProtocol ?? 'HTTP',
    );
  }

  get url(): $util.Output<string> {
    return $util
      .all([this.arn, this.built.runtime.region, this.protocol])
      .apply(([arn, region, protocol]) =>
        AgentRuntime.invocationUrlOf(arn, region, protocol),
      );
  }

  private build(name: string, args: AgentRuntimeArgs): AgentRuntimeNodes {
    const region = aws.getRegionOutput({}, { parent: this }).region;
    const account = aws.getCallerIdentityOutput({}, { parent: this }).accountId;

    const repository = new aws.ecr.Repository(
      `${name}Repository`,
      {
        name: AgentRuntime.repositoryNameOf(name),
        forceDelete: $app.stage !== 'production',
        imageScanningConfiguration: { scanOnPush: true },
      },
      { parent: this },
    );
    new aws.ecr.LifecyclePolicy(
      `${name}RepositoryLifecycle`,
      {
        repository: repository.name,
        policy: JSON.stringify({
          rules: [
            {
              rulePriority: 1,
              selection: {
                tagStatus: 'any',
                countType: 'imageCountMoreThan',
                countNumber: AgentRuntime.KEPT_IMAGES,
              },
              action: { type: 'expire' },
            },
          ],
        }),
      },
      { parent: this },
    );

    const registry = aws.ecr.getAuthorizationTokenOutput(
      { registryId: repository.registryId },
      { parent: this },
    );
    const image = new dockerbuild.Image(
      `${name}Image`,
      {
        context: { location: join($cli.paths.root, args.context ?? '.') },
        dockerfile: { location: join($cli.paths.root, args.dockerfile) },
        platforms: [AgentRuntime.PLATFORM],
        push: true,
        tags: [$interpolate`${repository.repositoryUrl}:latest`],
        registries: [
          {
            address: registry.proxyEndpoint,
            username: registry.userName,
            password: $util.secret(registry.password),
          },
        ],
      },
      { parent: this, dependsOn: args.dependsOn },
    );

    const role = new aws.iam.Role(
      `${name}Role`,
      {
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
                  'aws:SourceArn': $interpolate`arn:aws:bedrock-agentcore:${region}:${account}:*`,
                },
              },
            },
          ],
        }),
      },
      { parent: this },
    );
    const policy = new aws.iam.RolePolicy(
      `${name}Policy`,
      {
        role: role.id,
        policy: AgentRuntime.policyOf([
          AgentRuntime.platformPermissions(repository.arn, region, account),
          args.permissions ?? [],
          AgentRuntime.linkPermissionsOf(args.link),
        ]),
      },
      { parent: this },
    );

    const issuerWarmup = new command.local.Command(
      `${name}IssuerWarmup`,
      {
        create: $interpolate`node --input-type=module -e "$WARMUP" ${args.authorizer.discoveryUrl}`,
        environment: { WARMUP: AgentRuntime.ISSUER_WARMUP },
        triggers: [Date.now().toString()],
      },
      { parent: this, dependsOn: [image] },
    );

    const runtime = new aws.bedrock.AgentcoreAgentRuntime(
      `${name}Runtime`,
      {
        agentRuntimeName: AgentRuntime.nameOf(name),
        roleArn: role.arn,
        agentRuntimeArtifact: {
          containerConfiguration: {
            containerUri: $interpolate`${repository.repositoryUrl}@${image.digest}`,
          },
        },
        networkConfiguration: args.vpc
          ? {
              networkMode: 'VPC',
              networkModeConfig: {
                subnets: args.vpc.privateSubnets,
                securityGroups: args.vpc.securityGroups,
              },
            }
          : { networkMode: 'PUBLIC' },
        protocolConfiguration: { serverProtocol: args.protocol },
        authorizerConfiguration: {
          customJwtAuthorizer: {
            discoveryUrl: args.authorizer.discoveryUrl,
            allowedAudiences: args.authorizer.audiences,
          },
        },
        requestHeaderConfiguration: {
          requestHeaderAllowlists: ['Authorization', ...(args.headers ?? [])],
        },
        environmentVariables: $util
          .all([sst.Linkable.env(args.link ?? []), args.environment ?? {}])
          .apply(([linked, own]) => ({ ...linked, ...own })),
      },
      { parent: this, dependsOn: [policy, issuerWarmup] },
    );

    return { runtime, role, repository, image };
  }

  private static linkPermissionsOf(
    link: AgentRuntimeArgs['link'],
  ): $util.Output<AgentRuntimePermission[]> {
    return $output(link ?? []).apply((links) =>
      links
        .filter(
          (linkable): linkable is AgentRuntimeLinkable =>
            typeof linkable?.getSSTLink === 'function',
        )
        .flatMap((linkable) => linkable.getSSTLink().include ?? [])
        .filter((include) => include.type === 'aws.permission')
        .map((include) => include as unknown as AgentRuntimePermission),
    );
  }

  private static policyOf(
    sources: $util.Input<AgentRuntimePermission[]>[],
  ): $util.Output<string> {
    return $util.all(sources).apply(
      (permissions) =>
        aws.iam.getPolicyDocumentOutput({
          statements: permissions.flat().map((permission) => ({
            effect: permission.effect === 'deny' ? 'Deny' : 'Allow',
            actions: permission.actions,
            resources: permission.resources,
            conditions: permission.conditions,
          })),
        }).json,
    );
  }

  private static platformPermissions(
    repository: $util.Input<string>,
    region: $util.Input<string>,
    account: $util.Input<string>,
  ): AgentRuntimePermission[] {
    const logs = $interpolate`arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*`;
    return [
      {
        actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
        resources: [repository],
      },
      { actions: ['ecr:GetAuthorizationToken'], resources: ['*'] },
      {
        actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
        resources: [logs],
      },
      { actions: ['logs:DescribeLogGroups'], resources: ['*'] },
      {
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [$interpolate`${logs}:log-stream:*`],
      },
      {
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      },
      {
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: [
          {
            test: 'StringEquals',
            variable: 'cloudwatch:namespace',
            values: ['bedrock-agentcore'],
          },
        ],
      },
      {
        actions: [
          'bedrock-agentcore:GetWorkloadAccessToken',
          'bedrock-agentcore:GetWorkloadAccessTokenForJWT',
          'bedrock-agentcore:GetWorkloadAccessTokenForUserId',
        ],
        resources: [
          $interpolate`arn:aws:bedrock-agentcore:${region}:${account}:workload-identity-directory/default`,
          $interpolate`arn:aws:bedrock-agentcore:${region}:${account}:workload-identity-directory/default/workload-identity/*`,
        ],
      },
    ];
  }
}

sst.Linkable.wrap(AgentRuntime, (agent) => ({
  properties: { id: agent.id, arn: agent.arn, url: agent.url },
  include: [
    sst.aws.permission({
      actions: ['bedrock-agentcore:InvokeAgentRuntime'],
      resources: [agent.arn, $interpolate`${agent.arn}/*`],
    }),
  ],
}));
