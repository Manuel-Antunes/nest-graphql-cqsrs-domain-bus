import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { assetStorageOptionsFromEnv } from '@nestposts/asset/infrastructure/storage/asset-storage.options';

export const storageConfig = registerAs('storage', () => ({
  ...assetStorageOptionsFromEnv(process.env),
}));

export type StorageConfig = ConfigType<typeof storageConfig>;
