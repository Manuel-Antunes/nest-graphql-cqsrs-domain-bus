import { z } from 'zod';

export const TagIdSchema = z.uuid().brand<'TagId'>();
