import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import { Organization } from '../../domain/organization/organization.entity';
import type { OrganizationRepository } from '../../domain/organization/organization.repository';
import { OrganizationSlug } from '../../domain/organization/vo/organization-slug';
import { TenantMembershipGuard } from './tenant-membership.guard';

type Request = {
  headers: Record<string, string>;
  session?: { user: { id: string } } | null;
};

const graphqlContext = (req: Request): ExecutionContext =>
  ({
    getType: () => 'graphql',
    getArgByIndex: (index: number) => (index === 2 ? { req } : undefined),
  }) as unknown as ExecutionContext;

const organizationCalled = (slug: string): Organization => {
  const organization = new Organization();
  organization.slug = OrganizationSlug.parse(slug);
  return organization;
};

describe('a tenant is an organization, and only its members work in it', () => {
  let sessionsAsked: number;
  let membershipsAsked: CredentialId[];

  const guard = (session: { user: { id: string } } | null = null) => {
    const auth = {
      api: {
        getSession: async () => {
          sessionsAsked += 1;
          return session;
        },
      },
    } as unknown as BetterAuth;
    const organizations = {
      findAllOf: async (credentialId: CredentialId) => {
        membershipsAsked.push(credentialId);
        return credentialId.value === 'ana' ? [organizationCalled('acme')] : [];
      },
    } as unknown as OrganizationRepository;
    return new TenantMembershipGuard(auth, organizations);
  };

  beforeEach(() => {
    sessionsAsked = 0;
    membershipsAsked = [];
  });

  it('lets anybody into the root tenant, signed in or not, without asking who they are', async () => {
    await expect(
      guard().canActivate(graphqlContext({ headers: {} })),
    ).resolves.toBe(true);
    expect(sessionsAsked).toBe(0);
  });

  it('lets a member into the organization’s tenant', async () => {
    await expect(
      guard({ user: { id: 'ana' } }).canActivate(
        graphqlContext({ headers: { 'x-tenant': 'Acme' } }),
      ),
    ).resolves.toBe(true);
  });

  it('refuses whoever is not a member, and whoever has no session', async () => {
    await expect(
      guard({ user: { id: 'bia' } }).canActivate(
        graphqlContext({ headers: { 'x-tenant': 'acme' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard(null).canActivate(
        graphqlContext({ headers: { 'x-tenant': 'acme' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads the session the authentication guard already put on the request, when it ran first', async () => {
    await guard(null).canActivate(
      graphqlContext({
        headers: { 'x-tenant': 'acme' },
        session: { user: { id: 'ana' } },
      }),
    );

    expect(sessionsAsked).toBe(0);
    expect(membershipsAsked.map((id) => id.value)).toEqual(['ana']);
  });

  it('decides once per request, however many field resolvers it guards', async () => {
    const membership = guard({ user: { id: 'ana' } });
    const req: Request = { headers: { 'x-tenant': 'acme' } };

    await membership.canActivate(graphqlContext(req));
    await membership.canActivate(graphqlContext(req));

    expect(sessionsAsked).toBe(1);
    expect(membershipsAsked).toHaveLength(1);
  });

  it('lets a message through: its publisher already checked the tenant it carries', async () => {
    const message = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;

    await expect(guard().canActivate(message)).resolves.toBe(true);
  });
});
