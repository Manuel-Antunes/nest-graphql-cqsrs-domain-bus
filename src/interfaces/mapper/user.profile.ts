import { createMap, type Mapper, type MappingProfile } from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { User } from '../../domain/user/user.entity';
import { AuthorView, UserView } from '../../dto/graphql/user.view';

@Injectable()
export class UserProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(mapper, User, UserView);
      createMap(mapper, User, AuthorView);
    };
  }
}
