/// <reference path="../../../.sst/platform/config.d.ts" />

import { router } from '../edge/router';

// Private bucket — files are served through the CloudFront CDN below.
// Exception: everything under `tmp/*` is granted public `s3:GetObject`, so those
// objects are also readable directly from S3 (not just via the CDN).
export const bucket = new sst.aws.Bucket('Bucket', {
  access: 'cloudfront',
  cors: {
    allowOrigins: [router.url],
    allowMethods: ['PUT', 'GET', 'HEAD'],
    allowHeaders: ['*'],
  },
  // Public read for the tmp/ prefix. Object keys are `tmp/...` (see
  // apps/web/src/hooks/use-upload-file.ts).
  policy: [
    {
      principals: '*',
      actions: ['s3:GetObject'],
      paths: ['tmp/*'],
    },
  ],
  transform: {
    // `access: 'cloudfront'` otherwise sets these to `true`, which would block
    // the public `tmp/*` statement above from ever taking effect.
    publicAccessBlock: {
      blockPublicPolicy: false,
      restrictPublicBuckets: false,
    },
  },
  lifecycle: [
    {
      id: 'expire-tmp-files',
      prefix: 'tmp/',
      expiresIn: '1 day',
    },
  ],
});

router.routeBucket('/files', bucket, {
  rewrite: { regex: '^/files/(.*)$', to: '/$1' },
});

export const filesUrl = $interpolate`${router.url}/files/`;
