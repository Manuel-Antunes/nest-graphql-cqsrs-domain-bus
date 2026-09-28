import { z } from 'zod';

export const AssetUploadSchema = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  extname: z.string(),
  mimeType: z.string(),
});

export type AssetUpload = z.infer<typeof AssetUploadSchema>;
