import { z } from 'zod';

import { Email } from '../vo/email';
import { UserName } from '../vo/user-name';

export const NewUserSchema = z.object({
  email: Email.field(),
  name: UserName.field(),
});
export type NewUser = z.input<typeof NewUserSchema>;
