import {
  POST_RESOURCE,
  WRITE_A_POST,
} from '@nestposts/auth/infrastructure/better-auth/access';
import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc as organizationAdminAc,
  defaultStatements as organizationDefaultStatements,
  memberAc as organizationMemberAc,
  ownerAc as organizationOwnerAc,
} from 'better-auth/plugins/organization/access';

export const organizationStatements = {
  ...organizationDefaultStatements,
  [POST_RESOURCE]: [...WRITE_A_POST],
} as const;

export const organizationAccessControl = createAccessControl(
  organizationStatements,
);

export const organizationRoles = {
  owner: organizationAccessControl.newRole({
    ...organizationOwnerAc.statements,
    [POST_RESOURCE]: [...WRITE_A_POST],
  }),
  admin: organizationAccessControl.newRole({
    ...organizationAdminAc.statements,
    [POST_RESOURCE]: [...WRITE_A_POST],
  }),
  member: organizationAccessControl.newRole({
    ...organizationMemberAc.statements,
    [POST_RESOURCE]: ['create'],
  }),
};
