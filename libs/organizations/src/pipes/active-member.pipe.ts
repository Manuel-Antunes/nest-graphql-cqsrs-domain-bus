import type { PipeTransform } from '@nestjs/common';
import { Injectable, Scope } from '@nestjs/common';

import type { Member } from '../domain/organization/member.entity';
import { OrganizationService } from '../domain/organization/organization.service';

@Injectable({ scope: Scope.REQUEST })
export class ActiveMemberPipe
  implements PipeTransform<unknown, Promise<Member>>
{
  constructor(private readonly organizations: OrganizationService) {}

  transform(): Promise<Member> {
    return this.organizations.requireActiveMember();
  }
}
