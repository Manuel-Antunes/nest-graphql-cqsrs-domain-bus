import { z } from 'zod';

import { AssetMetaSchema } from './asset-meta.schema';

export const StoredAssetSchema = z.object({
  disk: z.string().optional(),
  path: z.string().min(1),
  originalName: z.string().optional(),
  size: z.number(),
  extname: z.string(),
  mimeType: z.string(),
  meta: AssetMetaSchema.optional(),
});

export const StoredVariantSchema = StoredAssetSchema.extend({
  key: z.string().min(1),
  blurhash: z.string().optional(),
});

export const StoredAttachmentSchema = StoredAssetSchema.extend({
  variants: z.array(StoredVariantSchema).optional(),
});

export type StoredAsset = z.infer<typeof StoredAssetSchema>;

export type StoredVariant = z.infer<typeof StoredVariantSchema>;

export type StoredAttachment = z.infer<typeof StoredAttachmentSchema>;
