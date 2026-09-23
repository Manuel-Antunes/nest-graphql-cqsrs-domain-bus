import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc as systemAdminAc,
  defaultStatements as systemDefaultStatements,
  userAc as systemUserAc,
} from 'better-auth/plugins/admin/access';

export const POST_RESOURCE = 'post';

export const WRITE_A_POST = ['create', 'update', 'delete'] as const;

export const systemStatements = {
  ...systemDefaultStatements,
  [POST_RESOURCE]: [...WRITE_A_POST],
} as const;

export const systemAccessControl = createAccessControl(systemStatements);

export const systemRoles = {
  admin: systemAccessControl.newRole({
    ...systemAdminAc.statements,
    [POST_RESOURCE]: [...WRITE_A_POST],
  }),
  [AUTHOR_ROLE]: systemAccessControl.newRole({
    ...systemUserAc.statements,
    [POST_RESOURCE]: [...WRITE_A_POST],
  }),
  user: systemAccessControl.newRole({ ...systemUserAc.statements }),
};
