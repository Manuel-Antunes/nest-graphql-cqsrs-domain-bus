import { z } from 'zod';

export const UserIdSchema = z.uuid().brand<'UserId'>();
