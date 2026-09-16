import { createMap, type Mapper, type MappingProfile } from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';

@Injectable()
export class UserProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(mapper, Reader, ReaderView);
      createMap(mapper, Author, AuthorView);
    };
  }

}
