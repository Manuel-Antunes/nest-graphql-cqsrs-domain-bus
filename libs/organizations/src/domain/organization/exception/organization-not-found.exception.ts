import type { OrganizationId } from '../vo/organization-id';

export class OrganizationNotFoundException extends Error {
  constructor(readonly organizationId: OrganizationId) {
    super(`organization ${organizationId} does not exist`);
    this.name = 'OrganizationNotFoundException';
  }
}
