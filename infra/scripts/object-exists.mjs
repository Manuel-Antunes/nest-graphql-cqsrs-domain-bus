#!/usr/bin/env node
// Whether an object is in a bucket, asked with the caller's own AWS credentials.
//
// It exists because the `aws` CLI cannot run on every machine this is used from (an x86 binary on
// Apple Silicon without Rosetta exits with `bad CPU type in executable`), and because a CDN is no
// witness: CloudFront keeps serving a deleted object for as long as it cached it.
//
//   node infra/scripts/object-exists.mjs <bucket> <key>   # prints yes/no, exits 0/1
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The SDK is a dependency of libs/asset, not of the repository root, so it is resolved from there.
const require = createRequire(join(root, 'libs/asset/package.json'));
const { HeadObjectCommand, NotFound, S3Client } = require('@aws-sdk/client-s3');

const [bucket, key] = process.argv.slice(2);
if (!bucket || !key) {
  console.error('usage: object-exists.mjs <bucket> <key>');
  process.exit(2);
}

const client = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  followRegionRedirects: true,
});

try {
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  console.log('yes');
  process.exit(0);
} catch (failure) {
  if (
    failure instanceof NotFound ||
    failure?.$metadata?.httpStatusCode === 404
  ) {
    console.log('no');
    process.exit(1);
  }
  throw failure;
}
