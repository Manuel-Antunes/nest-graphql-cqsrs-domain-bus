import { z } from 'zod';

export const CLIENT_STATUSES = ['ACTIVE', 'ARCHIVED', 'PENDING'] as const;

export type ClientStatusValue = (typeof CLIENT_STATUSES)[number];

export const DEFAULT_CLIENT_STATUS: ClientStatusValue = 'ACTIVE';

export const CLIENT_STATUS_MAX_LENGTH = 16;

export const ClientStatusSchema = z
  .enum(CLIENT_STATUSES, {
    error: `status must be one of ${CLIENT_STATUSES.join(', ')}`,
  })
  .brand<'ClientStatus'>();
