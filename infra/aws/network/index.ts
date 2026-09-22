/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * Every function here reaches two things that are not on the public internet — the database, inside
 * the VPC — and two that are — SNS and SQS. `nat: 'managed'` is what lets the second happen from
 * inside the first, and it is the single most expensive line in this stack.
 */
export const vpc = new sst.aws.Vpc('Vpc', { nat: 'managed' });
