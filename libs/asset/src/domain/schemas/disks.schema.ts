import { z } from 'zod';

export const DisksSchema = z.enum(['public', 'private']);

export type Disks = z.infer<typeof DisksSchema>;
