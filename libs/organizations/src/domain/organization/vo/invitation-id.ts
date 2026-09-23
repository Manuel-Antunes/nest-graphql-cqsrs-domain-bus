import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { InvitationIdSchema } from '../schemas/invitation-id.schema';

export class InvitationId extends ValidatedDto.Scalar(InvitationIdSchema) {}
