import { z } from 'zod';

export const ORGANIZATION_SLUG_MAX_LENGTH = 120;

export const OrganizationSlugSchema = z
  .string({ error: 'organization slug must not be empty' })
  .trim()
  .toLowerCase()
  .min(1, 'organization slug must not be empty')
  .max(ORGANIZATION_SLUG_MAX_LENGTH, `organization slug exceeds ${ORGANIZATION_SLUG_MAX_LENGTH} characters`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'organization slug accepts lowercase letters, digits and dashes')
  .brand<'OrganizationSlug'>();
