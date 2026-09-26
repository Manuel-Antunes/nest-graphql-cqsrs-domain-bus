import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { TeamIdSchema } from '../schemas/team-id.schema';

export class TeamId extends ValidatedDto.Scalar(TeamIdSchema) {}
