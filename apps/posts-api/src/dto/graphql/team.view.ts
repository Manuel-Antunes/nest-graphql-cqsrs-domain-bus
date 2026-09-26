import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { TeamName } from '@nestposts/organizations/domain/organization/vo/team-name';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

const TeamViewSchema = z.object({
  id: TeamId.field(),
  name: TeamName.field(),
});

@InheritValidatedMetadata()
export class TeamView extends ValidatedDto(TeamViewSchema) {}
