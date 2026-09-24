import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

const GeneratePresignedUrlInputSchema = z.object({
  mimeType: z.string().min(1).max(255),
});

@InheritValidatedMetadata()
export class GeneratePresignedUrlInput extends ValidatedDto(
  GeneratePresignedUrlInputSchema,
) {}
