import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';
import type { UserSession } from '@thallesp/nestjs-better-auth';

@Injectable()
export class SessionUserPipe
  implements PipeTransform<UserSession | Promise<UserSession>, Promise<User>>
{
  constructor(private readonly provisioning: UserProvisioning) {}

  async transform(
    maybeSession: UserSession | Promise<UserSession>,
  ): Promise<User> {
    const session = await maybeSession;
    const { id } = session.user as { id: string };
    return this.provisioning.provision(UserId.parse(id));
  }
}
