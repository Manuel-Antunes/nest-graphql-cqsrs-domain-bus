import type { PipeTransform } from '@nestjs/common';
import type { User } from '@nestposts/users/domain/user/user.entity';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Injectable } from '@nestjs/common';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import { UserProvisioning } from '../../application/user/user-provisioning.service';

@Injectable()
export class SessionUserPipe implements PipeTransform<
  UserSession | Promise<UserSession>,
  Promise<User>
> {
  constructor(private readonly provisioning: UserProvisioning) {}

  async transform(
    maybeSession: UserSession | Promise<UserSession>,
  ): Promise<User> {
    const session = await maybeSession;
    const { id } = session.user as { id: string };
    return this.provisioning.provision(CredentialId.parse(id));
  }
}
