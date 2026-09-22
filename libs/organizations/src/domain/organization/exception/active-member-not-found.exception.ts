import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import type { OrganizationId } from '../vo/organization-id';

export class ActiveMemberNotFoundException extends Error {
  constructor(
    readonly credentialId: CredentialId,
    readonly organizationId: OrganizationId,
  ) {
    super(`credential ${credentialId} holds no membership in organization ${organizationId}`);
    this.name = 'ActiveMemberNotFoundException';
  }
}
