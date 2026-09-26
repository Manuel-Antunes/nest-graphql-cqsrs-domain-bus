import { z } from 'zod';

export const AssetInputSchema = z.object({
  name: z.string(),
  size: z.number(),
  extname: z.string(),
  mimeType: z.string(),
});
