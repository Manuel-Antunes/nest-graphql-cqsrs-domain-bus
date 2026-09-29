import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';

import { SessionNotAuthenticatedException } from '../domain/auth/exception/session-not-authenticated.exception';
import type { Identity } from '../domain/auth/vo/identity';

@Injectable()
export class IdentityUserPipe
  implements PipeTransform<Identity | null, Promise<User>>
{
  constructor(private readonly provisioning: UserProvisioning) {}

  async transform(identity: Identity | null): Promise<User> {
    if (!identity) {
      throw new SessionNotAuthenticatedException();
    }
    return this.provisioning.provision(identity.userId);
  }
}
