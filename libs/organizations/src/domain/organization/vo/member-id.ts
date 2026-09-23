import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { MemberIdSchema } from '../schemas/member-id.schema';

export class MemberId extends ValidatedDto.Scalar(MemberIdSchema) {}
