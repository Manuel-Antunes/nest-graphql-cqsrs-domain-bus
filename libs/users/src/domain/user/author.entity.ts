import type { Ref } from '@mikro-orm/core';
import { PrimaryKeyProp, ref } from '@mikro-orm/core';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import { Delegate } from '@nestposts/platform/domain/shared/delegation/delegate';

import type { UserId } from './vo/user-id';
import { User } from './user.entity';

export const AUTHOR_ROLE = 'author';

export class Authorship extends BaseEntity<{ user: Ref<User> }> {
  [PrimaryKeyProp]?: 'user';

  user!: Ref<User>;

  static of(user: User): Authorship {
    return new Authorship({ user: ref(user) });
  }

  get id(): UserId {
    return this.user.id;
  }
}

export const Author = Delegate(User, {
  name: 'Author',
  to: Authorship,
  as: 'authorship',
  from: 'user',
  forwarding: [],
});

export type Author = InstanceType<typeof Author>;
