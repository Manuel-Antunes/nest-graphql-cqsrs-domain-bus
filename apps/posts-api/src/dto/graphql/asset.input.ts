import { AssetSchema } from '@nestposts/asset/domain/schemas/asset.schema';

export const AssetInputSchema = AssetSchema.pick({
  name: true,
  size: true,
  extname: true,
  mimeType: true,
});
