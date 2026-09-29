import type {} from '../../../../../.sst/platform/config.d.ts';

interface RedisStackArgs {
  vpc: sst.aws.Vpc;
}

// Self-hosted Redis Stack on Fargate. Used in place of `sst.aws.Redis`
// (ElastiCache Redis OSS) because LangGraph's RedisSaver/RedisStore call
// FT.CREATE (RediSearch) to build their checkpoint indexes — RediSearch is
// not part of ElastiCache's Redis OSS engine. `redis/redis-stack-server`
// bundles RediSearch + RedisJSON, which is what LangGraph needs.
export class RedisStack extends $util.ComponentResource {
  private cluster?: sst.aws.Cluster;
  private service?: sst.aws.Service;
  private data?: sst.aws.Efs;
  private passwordSecret?: sst.Secret;
  private readonly componentName: string;

  public readonly host: $util.Output<string>;
  public readonly port: $util.Output<number>;
  public readonly username: $util.Output<string>;
  public readonly password: $util.Output<string>;

  constructor(
    name: string,
    args: RedisStackArgs,
    opts?: $util.ComponentResourceOptions,
  ) {
    super('infra:aws:RedisStack', name, args, opts);
    this.componentName = name;

    if ($dev) {
      this.host = $output('localhost');
      this.port = $output(6379);
      this.username = $output('default');
      this.password = $output('');
      this.registerOutputs({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
      });
      return;
    }

    const { vpc } = args;
    this.passwordSecret = new sst.Secret(
      `${name}Password`,
      'redis-default-placeholder',
    );
    this.cluster = new sst.aws.Cluster(`${name}Cluster`, { vpc });
    this.data = new sst.aws.Efs(
      `${name}Data`,
      { vpc },
      {
        parent: this,
      },
    );
    this.service = this.buildService(vpc);

    this.host = this.service.nodes.loadBalancer.dnsName;
    this.port = $output(6379);
    this.username = $output('default');
    this.password = this.passwordSecret.value;

    this.registerOutputs({
      host: this.host,
      port: this.port,
      username: this.username,
      password: this.password,
    });
  }

  private buildService(vpc: sst.aws.Vpc) {
    const isProd = $app.stage === 'production';
    // Lock the internal NLB so only resources inside the VPC can reach
    // 6379. SST's default SG accepts 0.0.0.0/0 on every port — fine for a
    // public ALB, too permissive for a database. Combined with `public:
    // false` (NLB in private subnets) and the `--requirepass` AUTH below,
    // this gives us: not internet-reachable + only same-VPC peers can open
    // a TCP connection + must know the password to authenticate.
    const vpcCidr = vpc.nodes.vpc.cidrBlock;
    return new sst.aws.Service(
      `${this.componentName}Service`,
      {
        // biome-ignore lint/style/noNonNullAssertion: if the buildService() is called, the cluster is guaranteed to exist
        cluster: this.cluster!,
        architecture: 'arm64',
        cpu: isProd ? '0.5 vCPU' : '0.25 vCPU',
        memory: isProd ? '1 GB' : '0.5 GB',
        image: 'redis/redis-stack-server:7.4.0-v3',
        wait: true,
        environment: {
          // --appendonly yes turns on AOF persistence into the EFS volume
          // mounted at /data (the default Redis working directory).
          // biome-ignore lint/style/noNonNullAssertion: if the buildService() is called, the passwordSecret is guaranteed to exist
          REDIS_ARGS: this.passwordSecret!.value.apply(
            (pwd) => `--requirepass ${pwd} --appendonly yes`,
          ),
        },
        volumes: [
          {
            // biome-ignore lint/style/noNonNullAssertion: if the buildService() is called, the data is guaranteed to exist
            efs: this.data!,
            path: '/data',
          },
        ],
        loadBalancer: {
          public: false,
          ports: [{ listen: '6379/tcp' }],
        },
        transform: {
          loadBalancerSecurityGroup: {
            ingress: [
              {
                fromPort: 6379,
                toPort: 6379,
                protocol: 'tcp',
                cidrBlocks: [vpcCidr],
                description: 'Redis from inside the VPC only',
              },
            ],
          },
        },
      },
      {
        parent: this,
      },
    );
  }
}

sst.Linkable.wrap(RedisStack, (redis) => ({
  properties: {
    host: redis.host,
    port: redis.port,
    username: redis.username,
    password: redis.password,
  },
  include: [],
}));
