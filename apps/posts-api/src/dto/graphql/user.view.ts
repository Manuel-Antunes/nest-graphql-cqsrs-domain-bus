import { AutoMap } from '@automapper/classes';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AUTOMAP_REGISTRY } from './automap.registry';

const UserViewSchema = z.object({
  id: UserId.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  name: UserName.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  email: Email.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
});

const UserViewBase = ValidatedDto(UserViewSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
});

@InheritValidatedMetadata()
export class UserView extends UserViewBase {}

@InheritValidatedMetadata()
export class AuthorView extends UserViewBase {}

export type IUserView = UserView | AuthorView;
