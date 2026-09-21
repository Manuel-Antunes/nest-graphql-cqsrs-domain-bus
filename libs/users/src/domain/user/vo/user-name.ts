import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { UserNameSchema } from '../schemas/user-name.schema';

export class UserName extends ValidatedDto.Scalar(UserNameSchema) {}
