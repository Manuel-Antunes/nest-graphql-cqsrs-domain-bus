import { z } from 'zod';

export const AssetMetaSchema = z.object({
  orientation: z
    .object({ value: z.number(), description: z.string().optional() })
    .optional(),
  date: z.string().optional(),
  host: z.string().optional(),
  gps: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      altitude: z.number().optional(),
    })
    .optional(),
  dimension: z.object({ width: z.number(), height: z.number() }).optional(),
  duration: z.number().optional(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  pages: z.number().optional(),
  version: z.string().optional(),
});

export type AssetMeta = z.infer<typeof AssetMetaSchema>;
