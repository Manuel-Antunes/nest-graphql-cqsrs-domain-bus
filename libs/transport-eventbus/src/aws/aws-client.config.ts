/** The subset of an SDK client's configuration this library ever needs to fill in. */
export interface AwsClientConfig {
  region?: string;
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/** What LocalStack accepts and what the SDK refuses to run without: a pair, any pair. */
const LOCAL_CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };

const DEFAULT_LOCAL_REGION = 'us-east-1';

/**
 * **The one difference between talking to AWS and talking to LocalStack**, in one place.
 *
 * In a deployment this answers `{}`: the region comes from the Lambda's environment and the
 * credentials from its role, which is the whole point of the default provider chain — a service that
 * names either of them is a service that has an access key somewhere.
 *
 * Against LocalStack the endpoint is `AWS_ENDPOINT_URL`, and the SDK then needs two things it cannot
 * work out: a region (there is no metadata service to ask) and **some** credentials. Without the
 * second the client throws `CredentialsProviderError` — a message about a missing provider chain,
 * which reads like a misconfigured deployment rather than what it is. Supplying the pair LocalStack
 * itself documents is what keeps `docker compose up` from needing an AWS account.
 *
 * Real credentials, if the environment has them, are left alone: the fallback only fills a gap.
 */
export const awsClientConfig = (): AwsClientConfig => {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

  if (!endpoint) {
    return region ? { region } : {};
  }
  return {
    endpoint,
    region: region ?? DEFAULT_LOCAL_REGION,
    ...(process.env.AWS_ACCESS_KEY_ID
      ? {}
      : { credentials: LOCAL_CREDENTIALS }),
  };
};

/**
 * `arn:aws:sqs:<region>:<account>:<name>` → the URL the SQS API is called with.
 *
 * A Lambda's event-source mapping hands each record the queue's **ARN** (`eventSourceARN`) and no
 * URL, while every SQS call takes a URL — so the one place that needs to change a message's
 * visibility, or delete it, has to derive one. Against LocalStack the URL is the endpoint's, which is
 * why this reads the same environment the clients do.
 */
export const queueUrlFromArn = (
  arn: string | undefined,
): string | undefined => {
  const parts = (arn ?? '').split(':');
  if (parts.length < 6) {
    return undefined;
  }
  const [, , , region, account, name] = parts;
  const endpoint = process.env.AWS_ENDPOINT_URL;
  return endpoint
    ? `${endpoint.replace(/\/+$/, '')}/${account}/${name}`
    : `https://sqs.${region}.amazonaws.com/${account}/${name}`;
};

/** The last segment of a queue URL — what a log line should say instead of the whole URL. */
export const queueNameOf = (queueUrl: string): string =>
  queueUrl.split('/').filter(Boolean).pop() ?? queueUrl;

/**
 * The inverse of {@link queueUrlFromArn}, for a consumer that polls: it is given a URL, and every
 * record it builds has to carry the ARN a Lambda's record would have — because that is what the
 * retry policy reads to find the queue again. The two functions round-trip, LocalStack included.
 */
export const queueArnFromUrl = (queueUrl: string): string => {
  const { hostname, pathname } = new URL(queueUrl);
  const [account = '', name = ''] = pathname.split('/').filter(Boolean);
  const region =
    /^sqs\.([^.]+)\.amazonaws\.com$/.exec(hostname)?.[1] ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    DEFAULT_LOCAL_REGION;
  return `arn:aws:sqs:${region}:${account}:${name}`;
};

/** The account id LocalStack gives everything, and the one its URLs and ARNs are built from. */
export const LOCAL_ACCOUNT_ID = '000000000000';

const localEndpoint = (): string =>
  (process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566').replace(/\/+$/, '');

/**
 * The URL a queue of that name has on LocalStack, and the SQS default for local development.
 *
 * A default that only makes sense against LocalStack is the same bargain `RABBITMQ_URL` already
 * makes: `docker compose up` and `pnpm dev` work with nothing exported, and a deployment sets the
 * variable — which SST does, from the queue it created, so the name is never written twice.
 */
export const localQueueUrl = (name: string): string =>
  `${localEndpoint()}/${LOCAL_ACCOUNT_ID}/${name}`;

/** The ARN a topic of that name has on LocalStack. */
export const localTopicArn = (name: string): string =>
  `arn:aws:sns:${process.env.AWS_REGION ?? DEFAULT_LOCAL_REGION}:${LOCAL_ACCOUNT_ID}:${name}`;
