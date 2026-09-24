import { z } from 'zod';

export const AssetSchema = z.object({
  name: z.string(),
  size: z.number(),
  extname: z.string(),
  mimeType: z.string(),
  persisted: z.boolean().optional(),
  url: z.string().optional(),
});

export const AssetPropsSchema = AssetSchema.partial({ persisted: true });

export type IAsset = z.infer<typeof AssetSchema>;

export type AssetProps = z.infer<typeof AssetPropsSchema>;
