import { z } from 'zod';

export const ORGANIZATION_ID_MAX_LENGTH = 64;

export const OrganizationIdSchema = z
  .string({ error: 'organization id must not be empty' })
  .trim()
  .min(1, 'organization id must not be empty')
  .max(ORGANIZATION_ID_MAX_LENGTH, `organization id exceeds ${ORGANIZATION_ID_MAX_LENGTH} characters`)
  .brand<'OrganizationId'>();
