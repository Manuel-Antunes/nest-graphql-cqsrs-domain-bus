#!/usr/bin/env node
// The CloudWatch log group of the one Lambda function whose name starts with a prefix.
//
// SST names a function's log group itself, with a suffix of its own — it is NOT `/aws/lambda/` plus
// the function's name — and the function's name is not in `sst state export` in the clear either
// (it is derived from an environment that holds a secret, so Pulumi marks it secret). What a log
// group is called is what reading the function's log needs, and this finds it with the SDK, on a
// machine where the `aws` CLI may not run at all (an x86 binary on Apple Silicon without Rosetta
// exits with `bad CPU type in executable`).
//
//   node infra/scripts/log-group.mjs nestposts-dev-NotificatorFunction-   # prints /aws/lambda/…
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

const [prefix] = process.argv.slice(2);
if (!prefix) {
  console.error('usage: log-group.mjs <function name prefix>');
  process.exit(2);
}

const client = new CloudWatchLogsClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});
const { logGroups = [] } = await client.send(
  new DescribeLogGroupsCommand({ logGroupNamePrefix: `/aws/lambda/${prefix}` }),
);
if (logGroups.length !== 1) {
  console.error(
    `${logGroups.length} log groups start with /aws/lambda/${prefix}: ` +
      logGroups.map((group) => group.logGroupName).join(', '),
  );
  process.exit(1);
}
console.log(logGroups[0].logGroupName);
