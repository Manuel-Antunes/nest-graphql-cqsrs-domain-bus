import { z } from 'zod';

export const ORGANIZATION_NAME_MAX_LENGTH = 120;

export const OrganizationNameSchema = z
  .string({ error: 'organization name must not be empty' })
  .trim()
  .min(1, 'organization name must not be empty')
  .max(ORGANIZATION_NAME_MAX_LENGTH, `organization name exceeds ${ORGANIZATION_NAME_MAX_LENGTH} characters`)
  .brand<'OrganizationName'>();
