import type { Dns } from '../../../../../.sst/platform/src/components/dns';

type Neo4jComputeConfig =
  | {
      cpu: '2 vCPU';
      memory: '8 GB';
      instanceType: 't3.medium';
      storage: number;
    }
  | {
      cpu: '0.5 vCPU';
      memory: '1 GB';
      instanceType: 't3.nano';
      storage: number;
    };

type Neo4jAuth = {
  username: string;
  password: sst.Secret;
  readonly authString: $util.Output<string>;
};

interface Neo4jDomain {
  name: string;
  dns: Dns;
}

interface Neo4jArgs {
  /** Where Bolt answers by name; a stage with no domain of its own reaches the load balancer's. */
  domain?: Neo4jDomain;
  vpc: sst.aws.Vpc;
}

interface Neo4jRefArgs {
  ref: true;
  loadBalancerArn: $util.Input<string>;
}

const BOLT_PORT = 7687;
const USERNAME = 'neo4j';
const DATABASE = 'neo4j';

/**
 * Tag on the load balancer naming the SSM parameter that holds the password.
 *
 * Modelled on `sst:lookup:password`, which is how `sst.aws.Postgres.get`
 * resolves a password from nothing but a database id: the lookup key travels
 * with the resource instead of through the caller.
 */
const PASSWORD_PARAMETER_TAG = 'vaz:lookup:password-parameter';

export class Neo4j extends $util.ComponentResource {
  static readonly __pulumiType = 'infra:aws:Neo4j';

  private service?: sst.aws.Service;
  private auth?: Neo4jAuth;
  private cluster?: sst.aws.Cluster;
  private backupBucket?: sst.aws.Bucket;
  private computeConfig?: Neo4jComputeConfig;
  private passwordParameterResource?: aws.ssm.Parameter;

  public readonly uri: $util.Output<string>;
  public readonly username: $util.Output<string>;
  public readonly password: $util.Output<string>;
  public readonly database: $util.Output<string>;
  /**
   * ARN of the load balancer fronting Bolt — the whole identity of this
   * component as far as another stage is concerned. See {@link Neo4j.get}.
   */
  public readonly loadBalancerArn: $util.Output<string>;
  /** SSM parameter this stage keeps the password in. */
  public readonly passwordParameter: $util.Output<string>;
  private readonly componentName: string;

  constructor(
    name: string,
    args: Neo4jArgs | Neo4jRefArgs,
    opts?: $util.ComponentResourceOptions,
  ) {
    super(Neo4j.__pulumiType, name, args, opts);
    this.componentName = name;

    if ('ref' in args) {
      const loadBalancer = this.referenceLoadBalancer(args.loadBalancerArn);

      this.loadBalancerArn = loadBalancer.arn;
      this.uri = loadBalancer.dnsName.apply(
        (dnsName) => `bolt://${dnsName}:${BOLT_PORT}`,
      );
      this.username = $output(USERNAME);
      this.database = $output(DATABASE);
      this.passwordParameter = this.lookupPasswordParameter(loadBalancer);
      this.password = this.referencePassword(this.passwordParameter);

      this.registerOutputs(this.outputs());
      return;
    }

    const { vpc, domain } = args;
    // Computed, not read off the resource: the tag below has to carry it, and
    // the parameter cannot be created before the service that gets tagged.
    const parameterName = `/${$app.name}/${$app.stage}/${name}/password`;

    const backupBucket = this.buildBackupBucket();
    const computeConfig = this.buildComputeConfig();
    const auth = this.buildAuth();
    const cluster = this.buildCluster(vpc);
    const service = this.buildService(
      vpc,
      domain,
      computeConfig,
      cluster,
      backupBucket,
      auth,
      parameterName,
    );
    const passwordParameter = this.buildPasswordParameter(auth, parameterName);

    this.backupBucket = backupBucket;
    this.computeConfig = computeConfig;
    this.auth = auth;
    this.cluster = cluster;
    this.service = service;
    this.passwordParameterResource = passwordParameter;

    this.loadBalancerArn = service.nodes.loadBalancer.arn;
    this.uri = service.nodes.loadBalancer.dnsName.apply(
      (dnsName) => `bolt://${dnsName}:${BOLT_PORT}`,
    );
    this.username = $output(auth.username);
    this.password = auth.password.value;
    this.database = $output(DATABASE);
    this.passwordParameter = passwordParameter.name;

    this.registerOutputs(this.outputs());
  }

  /**
   * References the Neo4j another stage created, instead of standing one up.
   *
   * Takes the same shape as `sst.aws.Postgres.get`: one identifier, everything
   * else read back off AWS. The load balancer answers for the Bolt endpoint,
   * and its `vaz:lookup:password-parameter` tag says where the password lives —
   * so a referencing stage carries a single opaque ARN and nothing that can
   * drift out of sync with the running service.
   *
   * ```ts
   * const neo4j = Neo4j.get(
   *   'Neo4j',
   *   'arn:aws:elasticloadbalancing:us-east-1:...:loadbalancer/net/Neo4j/...',
   * );
   * ```
   */
  public static get(
    name: string,
    loadBalancerArn: $util.Input<string>,
    opts?: $util.ComponentResourceOptions,
  ) {
    return new Neo4j(name, { ref: true, loadBalancerArn }, opts);
  }

  /**
   * Reads off the resolved outputs rather than the child resources, so it
   * answers the same on a referenced instance as on one this stage created.
   */
  connectionInfo() {
    return {
      uri: this.uri,
      username: this.username,
      password: this.password,
      database: this.database,
    };
  }

  private outputs() {
    return {
      uri: this.uri,
      database: this.database,
      username: this.username,
      password: this.password,
      loadBalancerArn: this.loadBalancerArn,
      passwordParameter: this.passwordParameter,
    };
  }

  private referenceLoadBalancer(arn: $util.Input<string>) {
    return aws.lb.LoadBalancer.get(
      `${this.componentName}LoadBalancer`,
      arn,
      undefined,
      { parent: this },
    );
  }

  /**
   * Resolves the password parameter from the load balancer's tags.
   *
   * A missing tag means the ARN points at a load balancer this component did
   * not create — worth failing on, because the alternative is a `get` that
   * silently hands back a database nobody can authenticate against.
   */
  private lookupPasswordParameter(loadBalancer: aws.lb.LoadBalancer) {
    return loadBalancer.tagsAll.apply((tags) => {
      const parameterName = tags?.[PASSWORD_PARAMETER_TAG];

      if (!parameterName) {
        throw new Error(
          `[Neo4j] load balancer for "${this.componentName}" carries no ${PASSWORD_PARAMETER_TAG} tag, so its password cannot be resolved. Check that the ARN is the one this component created.`,
        );
      }

      return parameterName;
    });
  }

  /**
   * Reads the owning stage's password at deploy time.
   *
   * A plain lookup rather than a stored value: SST secrets are scoped to one
   * app+stage, so a referencing stage's own `sst.Secret` would resolve to the
   * placeholder instead of the password the running database actually demands.
   * Keeping it out of the caller's hands also keeps it out of `SHARED_STORE`,
   * which is projected into CI logs and `.env` files.
   */
  private referencePassword(parameterName: $util.Output<string>) {
    return $util.secret(
      aws.ssm.getParameterOutput(
        { name: parameterName, withDecryption: true },
        { parent: this },
      ).value,
    );
  }

  /**
   * Mirrors the `sst.Secret` into SSM so other stages can reach it.
   *
   * SecureString, so the value is KMS-encrypted at rest and only readable by
   * principals allowed to decrypt with `alias/aws/ssm` — which the deploy role
   * already is.
   */
  private buildPasswordParameter(auth: Neo4jAuth, parameterName: string) {
    return new aws.ssm.Parameter(
      `${this.componentName}PasswordParameter`,
      {
        name: parameterName,
        type: 'SecureString',
        value: auth.password.value,
        description: `Neo4j password for ${this.componentName} on ${$app.stage}`,
      },
      { parent: this },
    );
  }

  private buildComputeConfig() {
    const isProd = $app.stage === 'production';
    return isProd
      ? {
          cpu: '2 vCPU' as const,
          memory: '8 GB' as const,
          instanceType: 't3.medium' as const, // Ou instâncias otimizadas para memória (r6g)
          storage: 50,
        }
      : {
          cpu: '0.5 vCPU' as const,
          memory: '1 GB' as const,
          instanceType: 't3.nano' as const, // Foco em custo mínimo
          storage: 10,
        };
  }

  private buildBackupBucket() {
    return new sst.aws.Bucket(`${this.componentName}Backups`);
  }

  private buildAuth() {
    return {
      username: USERNAME,
      password: new sst.Secret(
        `${this.componentName}Key`,
        'my-secret-placeholder-value',
      ),
      get authString() {
        return this.password.value.apply((pwd) => `${this.username}/${pwd}`);
      },
    };
  }

  private buildCluster(vpc: sst.aws.Vpc) {
    return new sst.aws.Cluster(`${this.componentName}Cluster`, { vpc });
  }

  private buildEnvironment(auth: Neo4jAuth, backupBucket: sst.aws.Bucket) {
    return {
      NEO4J_AUTH: auth.authString, // Recomenda-se usar sst.Secret
      NEO4J_ACCEPT_LICENSE_AGREEMENT: 'yes',
      NEO4J_PLUGINS: '["apoc"]',
      BACKUP_BUCKET_NAME: backupBucket.name,
    };
  }

  private buildService(
    vpc: sst.aws.Vpc,
    domain: Neo4jDomain | undefined,
    computeConfig: Neo4jComputeConfig,
    cluster: sst.aws.Cluster,
    backupBucket: sst.aws.Bucket,
    auth: Neo4jAuth,
    parameterName: string,
  ) {
    return new sst.aws.Service(`${this.componentName}Service`, {
      cluster,
      architecture: 'arm64', // Graviton cost-benefit
      cpu: computeConfig.cpu,
      memory: computeConfig.memory,
      image: 'neo4j:5.20-enterprise', // Enterprise permite backup online
      wait: true,
      environment: this.buildEnvironment(auth, backupBucket),
      volumes: [
        {
          // Persistência de dados via EFS para facilitar replicação/durabilidade
          efs: new sst.aws.Efs(`${this.componentName}Data`, { vpc }),
          path: '/data',
        },
      ],
      loadBalancer: {
        ...(domain && { domain: { name: domain.name, dns: domain.dns } }),
        ports: [{ listen: `${BOLT_PORT}/tcp` }],
      },
      transform: {
        // The function form, not `{ tags }`: an object transform is spread over
        // the args and would drop whatever tags SST puts there itself.
        loadBalancer: (loadBalancerArgs) => {
          loadBalancerArgs.tags = $output(loadBalancerArgs.tags).apply(
            (tags) => ({
              ...tags,
              [PASSWORD_PARAMETER_TAG]: parameterName,
            }),
          );
        },
      },
      // Permissões para o container acessar o S3
      link: [backupBucket],
    });
  }
}

sst.Linkable.wrap(Neo4j, (neo4j) => {
  return {
    properties: {
      uri: neo4j.uri,
      database: neo4j.database,
      username: neo4j.username,
      password: neo4j.password,
    },
  };
});
