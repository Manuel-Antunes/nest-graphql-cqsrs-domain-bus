import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { UserNameSchema } from '../schemas/user-name.schema';
import type { Email } from './email';

export class UserName extends ValidatedDto.Scalar(UserNameSchema) {
  static from(given: string | null | undefined, email: Email): UserName {
    return UserName.parse(given?.trim() || email.localPart);
  }
}
