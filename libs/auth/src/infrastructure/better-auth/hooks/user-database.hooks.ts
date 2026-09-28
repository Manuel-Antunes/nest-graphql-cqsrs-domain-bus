import { Injectable } from '@nestjs/common';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import {
  BeforeCreate,
  BeforeUpdate,
  DatabaseHook,
} from '@thallesp/nestjs-better-auth';

import type { AvatarWriteOrigin } from '../avatar/avatar-images';
import { AvatarImages } from '../avatar/avatar-images';

/** A user as Better Auth writes it: its own fields, strings on the wire. */
export interface UserWrite {
  readonly name?: string;
  readonly email?: string;
  readonly image?: unknown;
  readonly [field: string]: unknown;
}

/**
 * What every write of a user goes through before it reaches the row, in whichever process holds the
 * Better Auth instance — `@thallesp/nestjs-better-auth`'s `@DatabaseHook`s, which its `AuthModule`
 * attaches to the instance's `databaseHooks`:
 *
 * - **a user is born with a name** — a magic link or an emailed code signs up an address with
 *   `name: ''`, which `UserName` refuses, so it is named after the email's local part;
 * - **the `image` is an attachment** — {@link AvatarImages}.
 *
 * Both live in this one provider on purpose: that library attaches a second provider to the same
 * model, operation and moment by awaiting the first and answering with the second alone, so a
 * `@BeforeCreate('user')` anywhere else would silently drop what this one returns.
 */
@Injectable()
@DatabaseHook()
export class UserDatabaseHooks {
  constructor(private readonly avatars: AvatarImages) {}

  @BeforeCreate('user')
  async beforeCreate(
    user: UserWrite,
    origin?: AvatarWriteOrigin | null,
  ): Promise<{ data: UserWrite }> {
    const named = {
      ...user,
      name: UserName.from(user.name, Email.parse(user.email)).value,
    };
    return { data: await this.avatars.written(named, origin) };
  }

  @BeforeUpdate('user')
  async beforeUpdate(
    user: UserWrite,
    origin?: AvatarWriteOrigin | null,
  ): Promise<{ data: UserWrite }> {
    return { data: await this.avatars.written(user, origin) };
  }
}
