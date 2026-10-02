/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * Every function here reaches two things that are not on the public internet — the database, inside
 * the VPC — and two that are — SNS and SQS. `nat: 'managed'` is what lets the second happen from
 * inside the first, and it is the single most expensive line in this stack.
 *
 * Outside production it carries a bastion — one `t4g.nano` in a public subnet — which is how a person
 * reaches the database and the cache at all: `sst tunnel --stage <name>`, or an SSH forward with the
 * key SST keeps in SSM (`infra/aws/README.md`).
 */
export const vpc = new sst.aws.Vpc('Vpc', {
  nat: 'managed',
  bastion: $app.stage !== 'production',
});
