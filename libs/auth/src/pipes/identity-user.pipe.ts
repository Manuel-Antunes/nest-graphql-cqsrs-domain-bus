import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';

import type { Identity } from '../domain/auth/vo/identity';
import { UserIdentity } from '../domain/auth/vo/user-identity';

@Injectable()
export class IdentityUserPipe
  implements PipeTransform<Identity | null, Promise<User>>
{
  constructor(private readonly provisioning: UserProvisioning) {}

  async transform(identity: Identity | null): Promise<User> {
    return this.provisioning.provision(UserIdentity.required(identity).userId);
  }
}
