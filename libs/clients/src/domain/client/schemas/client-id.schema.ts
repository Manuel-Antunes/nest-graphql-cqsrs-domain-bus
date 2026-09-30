import { z } from 'zod';

export const ClientIdSchema = z.uuid().brand<'ClientId'>();
