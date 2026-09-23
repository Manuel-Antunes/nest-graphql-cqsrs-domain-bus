import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import {
  MEMBER_ROLE,
  MemberRoleSchema,
  ORGANIZATION_ADMIN_ROLE,
  OWNER_ROLE,
} from '../schemas/member-role.schema';

export class MemberRole extends ValidatedDto.Scalar(MemberRoleSchema) {
  isOwner(): boolean {
    return this.value === OWNER_ROLE;
  }

  isAdmin(): boolean {
    return this.value === OWNER_ROLE || this.value === ORGANIZATION_ADMIN_ROLE;
  }

  isMember(): boolean {
    return this.value === MEMBER_ROLE;
  }
}
