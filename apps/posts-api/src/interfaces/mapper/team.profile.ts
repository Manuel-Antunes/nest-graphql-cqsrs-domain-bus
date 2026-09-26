import type { Mapper, MappingProfile } from '@automapper/core';
import { createMap, forMember, mapFrom } from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';

import { TeamView } from '../../dto/graphql/team.view';

@Injectable()
export class TeamProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(
        mapper,
        Team,
        TeamView,
        forMember(
          (view) => view.id,
          mapFrom((team) => team.id),
        ),
        forMember(
          (view) => view.name,
          mapFrom((team) => team.name),
        ),
      );
    };
  }

  static viewOf(mapper: Mapper, team: Team): TeamView {
    return mapper.map(team, Team, TeamView);
  }
}
