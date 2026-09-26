import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import {
  MemberHasPermission,
  OrgRoles,
  RequireActiveOrg,
} from '@thallesp/nestjs-better-auth';

import { Organization } from '../../domain/organization/organization.entity';
import type { OrganizationRepository } from '../../domain/organization/organization.repository';
import type { OrganizationId } from '../../domain/organization/vo/organization-id';
import { OrganizationSlug } from '../../domain/organization/vo/organization-slug';
import { TenantMembershipGuard } from './tenant-membership.guard';

type Session = {
  user: { id: string };
  session?: { activeOrganizationId: string | null };
};

type Request = {
  headers: Record<string, string>;
  session?: Session | null;
};

class Resolvers {
  events(): void {}

  @MemberHasPermission({ permissions: { event: ['update'] } })
  updateEvent(): void {}

  @OrgRoles(['owner'])
  deleteOrganization(): void {}

  @RequireActiveOrg()
  activeOrganization(): void {}
}

type Handler = keyof Resolvers;

const graphqlContext = (
  req: Request,
  handler: Handler = 'events',
): ExecutionContext =>
  ({
    getType: () => 'graphql',
    getArgByIndex: (index: number) => (index === 2 ? { req } : undefined),
    getHandler: () => Resolvers.prototype[handler],
    getClass: () => Resolvers,
  }) as unknown as ExecutionContext;

const organizationCalled = (slug: string): Organization => {
  const organization = new Organization();
  organization.slug = OrganizationSlug.parse(slug);
  return organization;
};

describe('a tenant is an organization, and only its members work in it', () => {
  let sessionsAsked: number;
  let membershipsAsked: CredentialId[];

  const guard = (session: Session | null = null) => {
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
        return credentialId.value === 'ana'
          ? [organizationCalled('acme'), organizationCalled('initech')]
          : [];
      },
      findById: async (organizationId: OrganizationId) =>
        organizationCalled(organizationId.value.replace(/^org_/, '')),
    } as unknown as OrganizationRepository;
    return new TenantMembershipGuard(auth, organizations, new Reflector());
  };

  const ana = (activeOrganizationId: string | null): Session => ({
    user: { id: 'ana' },
    session: { activeOrganizationId },
  });

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

  describe('on a handler checked against the active organization', () => {
    it('lets the caller work in the tenant of the organization that is active', async () => {
      await expect(
        guard(ana('org_acme')).canActivate(
          graphqlContext({ headers: { 'x-tenant': 'acme' } }, 'updateEvent'),
        ),
      ).resolves.toBe(true);
    });

    it('refuses another tenant of theirs, where the role checked would not be the one held', async () => {
      for (const handler of [
        'updateEvent',
        'deleteOrganization',
        'activeOrganization',
      ] as const) {
        await expect(
          guard(ana('org_acme')).canActivate(
            graphqlContext({ headers: { 'x-tenant': 'initech' } }, handler),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('refuses the root tenant, which is no organization, and a session with none active', async () => {
      await expect(
        guard(ana('org_acme')).canActivate(
          graphqlContext({ headers: {} }, 'updateEvent'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        guard(ana(null)).canActivate(
          graphqlContext({ headers: { 'x-tenant': 'acme' } }, 'updateEvent'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('leaves every other handler free to name any tenant of theirs', async () => {
      await expect(
        guard(ana('org_acme')).canActivate(
          graphqlContext({ headers: { 'x-tenant': 'initech' } }),
        ),
      ).resolves.toBe(true);
    });

    it('asks for the session once, however many of its checks need it', async () => {
      await guard(ana('org_acme')).canActivate(
        graphqlContext({ headers: { 'x-tenant': 'acme' } }, 'updateEvent'),
      );

      expect(sessionsAsked).toBe(1);
    });
  });

  it('lets a message through: its publisher already checked the tenant it carries', async () => {
    const message = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;

    await expect(guard().canActivate(message)).resolves.toBe(true);
  });
});
