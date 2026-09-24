import { z } from 'zod';

import { AssetSchema } from './asset.schema';
import { AttachmentOptionsSchema } from './attachment-options.schema';

export const PersistAssetJobSchema = z.object({
  asset: AssetSchema,
  options: AttachmentOptionsSchema,
});

export type PersistAssetJob = z.infer<typeof PersistAssetJobSchema>;
