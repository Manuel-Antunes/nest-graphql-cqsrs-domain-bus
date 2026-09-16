import { AutoMap } from '@automapper/classes';
import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { AUTOMAP_REGISTRY } from './automap.registry';
import { Email } from '../../domain/user/vo/email';
import { UserId } from '../../domain/user/vo/user-id';
import { UserName } from '../../domain/user/vo/user-name';

const UserViewSchema = z.object({
  id: UserId.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  name: UserName.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  email: Email.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
});

const UserViewBase = ValidatedDto(UserViewSchema, { DECORATOR_REGISTRY: AUTOMAP_REGISTRY });

@InheritValidatedMetadata()
export class ReaderView extends UserViewBase {}

@InheritValidatedMetadata()
export class AuthorView extends UserViewBase {}

export type UserView = ReaderView | AuthorView;
