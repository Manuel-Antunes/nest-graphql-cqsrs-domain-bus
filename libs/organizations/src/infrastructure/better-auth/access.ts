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

export const EVENT_RESOURCE = 'event';

export const MANAGE_EVENTS = ['read', 'create', 'update', 'delete'] as const;

export const CLIENT_RESOURCE = 'client';

export const MANAGE_CLIENTS = ['read', 'create', 'update', 'delete'] as const;

export const KEEP_CLIENTS = ['read', 'create', 'update'] as const;

export const organizationStatements = {
  ...organizationDefaultStatements,
  [POST_RESOURCE]: [...WRITE_A_POST],
  [EVENT_RESOURCE]: [...MANAGE_EVENTS],
  [CLIENT_RESOURCE]: [...MANAGE_CLIENTS],
} as const;

export const organizationAccessControl = createAccessControl(
  organizationStatements,
);

export const organizationRoles = {
  owner: organizationAccessControl.newRole({
    ...organizationOwnerAc.statements,
    [POST_RESOURCE]: [...WRITE_A_POST],
    [EVENT_RESOURCE]: [...MANAGE_EVENTS],
    [CLIENT_RESOURCE]: [...MANAGE_CLIENTS],
  }),
  admin: organizationAccessControl.newRole({
    ...organizationAdminAc.statements,
    [POST_RESOURCE]: [...WRITE_A_POST],
    [EVENT_RESOURCE]: [...MANAGE_EVENTS],
    [CLIENT_RESOURCE]: [...MANAGE_CLIENTS],
  }),
  member: organizationAccessControl.newRole({
    ...organizationMemberAc.statements,
    [POST_RESOURCE]: ['create'],
    [CLIENT_RESOURCE]: [...KEEP_CLIENTS],
  }),
};
