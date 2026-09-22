import type { Member } from './member.entity';
import type { Organization } from './organization.entity';
import type { OrganizationId } from './vo/organization-id';

export type OrganizationPermissionRequest = Readonly<Record<string, readonly string[]>>;

/**
 * **What the caller of THIS request may see and do, organization-wise** — the half of authorization
 * that `AuthService` deliberately does not answer, because an organization is this module's idea and
 * not authentication's.
 *
 * Request-scoped for the same reason `AuthService` is: the request is the constructor's business, so
 * "the active organization" is never ambiguous about whose.
 */
export abstract class OrganizationService {
  abstract organizations(): Promise<Organization[]>;

  abstract activeOrganization(): Promise<Organization | null>;

  abstract activeOrganizationId(): Promise<OrganizationId | null>;

  abstract setActiveOrganization(organizationId: OrganizationId | null): Promise<Organization | null>;

  abstract activeMember(): Promise<Member | null>;

  abstract requireActiveMember(): Promise<Member>;

  abstract hasOrganizationRole(roles: readonly string[]): Promise<boolean>;

  abstract hasOrganizationPermission(
    permissions: OrganizationPermissionRequest,
    organizationId?: OrganizationId,
  ): Promise<boolean>;
}
