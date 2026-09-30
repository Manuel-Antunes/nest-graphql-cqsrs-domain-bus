import { z } from 'zod';

import { Address } from '../vo/address';
import { ClientDetails } from '../vo/client-details';
import { ClientId } from '../vo/client-id';
import { ClientStatus } from '../vo/client-status';

export const ClientSchema = z
  .object({
    id: ClientId.field(),
    details: ClientDetails.field(),
    address: Address.field(),
    status: ClientStatus.field(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine((state) => state.updatedAt >= state.createdAt, {
    error: 'updatedAt cannot precede createdAt',
    path: ['updatedAt'],
  });

export type IClient = z.input<typeof ClientSchema>;
