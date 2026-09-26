import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { TeamNameSchema } from '../schemas/team-name.schema';

export class TeamName extends ValidatedDto.Scalar(TeamNameSchema) {}
