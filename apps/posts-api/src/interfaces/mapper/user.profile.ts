import type { Mapper, MappingProfile } from '@automapper/core';
import { createMap } from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';

import type { IUserView } from '../../dto/graphql/user.view';
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

  static viewTypeOf(user: User): typeof UserView | typeof AuthorView {
    return user.hasRole(AUTHOR_ROLE) ? AuthorView : UserView;
  }

  static viewOf(mapper: Mapper, user: User): IUserView {
    return mapper.map(user, User, UserProfile.viewTypeOf(user));
  }
}
