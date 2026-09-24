import { assetStorageOptionsFromEnv } from './asset-storage.options';

describe('assetStorageOptionsFromEnv', () => {
  it('stores in the local bucket, on the public disk, path-style, when nothing is set', () => {
    expect(assetStorageOptionsFromEnv({})).toEqual({
      bucket: 'local',
      defaultDisk: 'public',
      region: undefined,
      endpoint: undefined,
      forcePathStyle: true,
      cdnUrl: undefined,
      credentials: undefined,
    });
  });

  it('reads every DRIVE_* variable', () => {
    expect(
      assetStorageOptionsFromEnv({
        DRIVE_DISK: 'private',
        DRIVE_BUCKET: 'uploads',
        DRIVE_CDN_URL: 'https://cdn.example',
        DRIVE_S3_ENDPOINT: 'http://localhost:4566',
        DRIVE_S3_PUBLIC_ENDPOINT: 'http://storage.example',
        DRIVE_AWS_REGION: 'sa-east-1',
        DRIVE_AWS_ACCESS_KEY_ID: 'key',
        DRIVE_AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toEqual({
      bucket: 'uploads',
      defaultDisk: 'private',
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      publicEndpoint: 'http://storage.example',
      forcePathStyle: true,
      cdnUrl: 'https://cdn.example',
      credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
    });
  });

  it('leaves the credentials to the SDK unless both keys are given', () => {
    expect(
      assetStorageOptionsFromEnv({ DRIVE_AWS_ACCESS_KEY_ID: 'key' })
        .credentials,
    ).toBeUndefined();
  });

  it('addresses the bucket path-style when told to, even in production', () => {
    expect(
      assetStorageOptionsFromEnv({
        NODE_ENV: 'production',
        DRIVE_S3_FORCE_PATH_STYLE: 'true',
      }).forcePathStyle,
    ).toBe(true);
  });

  it('addresses the bucket virtual-host style in production', () => {
    expect(
      assetStorageOptionsFromEnv({ NODE_ENV: 'production' }).forcePathStyle,
    ).toBe(false);
  });

  it('refuses a disk that does not exist and a CDN that is not a URL', () => {
    expect(() =>
      assetStorageOptionsFromEnv({ DRIVE_DISK: 'shared' }),
    ).toThrow();
    expect(() =>
      assetStorageOptionsFromEnv({ DRIVE_CDN_URL: 'cdn.example' }),
    ).toThrow();
  });
});
