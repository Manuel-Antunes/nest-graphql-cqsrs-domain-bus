import { randomUUID } from 'node:crypto';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { UserIdSchema } from '../schemas/user-id.schema';

export class UserId extends ValidatedDto.Scalar(UserIdSchema) {
  static generate(): UserId {
    return UserId.parse(randomUUID());
  }
}
