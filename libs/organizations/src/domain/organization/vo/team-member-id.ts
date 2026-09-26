import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { TeamMemberIdSchema } from '../schemas/team-member-id.schema';

export class TeamMemberId extends ValidatedDto.Scalar(TeamMemberIdSchema) {}
