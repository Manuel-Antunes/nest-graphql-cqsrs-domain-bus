/** The subset of an SDK client's configuration a service fills in for the clients of this library. */
export interface AwsClientConfig {
  region?: string;
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/**
 * What LocalStack accepts and what the SDK refuses to run without: a pair, any pair. Against an
 * endpoint of its own the SDK has no provider chain to ask, and without some credentials it throws
 * `CredentialsProviderError` — which reads like a misconfigured deployment rather than what it is.
 */
export const LOCALSTACK_CREDENTIALS = {
  accessKeyId: 'test',
  secretAccessKey: 'test',
};

/** The region LocalStack answers in when nothing names one: there is no metadata service to ask. */
export const LOCALSTACK_REGION = 'us-east-1';

export const LOCALSTACK_ENDPOINT = 'http://localhost:4566';

/**
 * `arn:aws:sqs:<region>:<account>:<name>` → the URL the SQS API is called with.
 *
 * A Lambda's event-source mapping hands each record the queue's **ARN** (`eventSourceARN`) and no
 * URL, while every SQS call takes a URL — so the one place that needs to change a message's
 * visibility, or delete it, has to derive one. Against LocalStack the URL is the `endpoint`'s, the
 * one the clients were given.
 */
export const queueUrlFromArn = (
  arn: string | undefined,
  endpoint?: string,
): string | undefined => {
  const parts = (arn ?? '').split(':');
  if (parts.length < 6) {
    return undefined;
  }
  const [, , , region, account, name] = parts;
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
export const queueArnFromUrl = (
  queueUrl: string,
  region: string = LOCALSTACK_REGION,
): string => {
  const { hostname, pathname } = new URL(queueUrl);
  const [account = '', name = ''] = pathname.split('/').filter(Boolean);
  const queueRegion =
    /^sqs\.([^.]+)\.amazonaws\.com$/.exec(hostname)?.[1] ?? region;
  return `arn:aws:sqs:${queueRegion}:${account}:${name}`;
};

/** The account id LocalStack gives everything, and the one its URLs and ARNs are built from. */
export const LOCAL_ACCOUNT_ID = '000000000000';

/**
 * The URL a queue of that name has on LocalStack at `endpoint` — the default a service's own
 * configuration falls back to, so `docker compose up` works with nothing exported and a deployment
 * names the real queue.
 */
export const localQueueUrl = (
  name: string,
  endpoint: string = LOCALSTACK_ENDPOINT,
): string => `${endpoint.replace(/\/+$/, '')}/${LOCAL_ACCOUNT_ID}/${name}`;

/** The ARN a topic of that name has on LocalStack, in `region`. */
export const localTopicArn = (
  name: string,
  region: string = LOCALSTACK_REGION,
): string => `arn:aws:sns:${region}:${LOCAL_ACCOUNT_ID}:${name}`;
