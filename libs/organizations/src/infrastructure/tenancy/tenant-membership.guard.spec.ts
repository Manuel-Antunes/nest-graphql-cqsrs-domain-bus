import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BetterAuthIdentityResolver } from '@nestposts/auth/infrastructure/better-auth/identity/better-auth-identity.resolver';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';
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
  user: { id: string; email: string; name: string };
  session: { activeOrganizationId: string | null };
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
  credentials: Record<string, string> = {
    cookie: 'better-auth.session_token=t',
  },
): ExecutionContext => {
  Object.assign(req.headers, credentials);
  return {
    getType: () => 'graphql',
    getArgByIndex: (index: number) => (index === 2 ? { req } : undefined),
    getHandler: () => Resolvers.prototype[handler],
    getClass: () => Resolvers,
  } as unknown as ExecutionContext;
};

const organizationCalled = (slug: string): Organization => {
  const organization = new Organization();
  organization.slug = OrganizationSlug.parse(slug);
  return organization;
};

describe('a tenant is an organization, and only its members work in it', () => {
  let sessionsAsked: number;
  let membershipsAsked: UserId[];

  const guard = (req: Request, session: Session | null = null) => {
    const auth = {
      api: {
        getSession: async () => {
          sessionsAsked += 1;
          return session;
        },
      },
    } as unknown as BetterAuth;
    const organizations = {
      findAllOf: async (userId: UserId) => {
        membershipsAsked.push(userId);
        return userId.value === 'ana'
          ? [organizationCalled('acme'), organizationCalled('initech')]
          : [];
      },
      findById: async (organizationId: OrganizationId) =>
        organizationCalled(organizationId.value.replace(/^org_/, '')),
    } as unknown as OrganizationRepository;
    return new TenantMembershipGuard(
      new BetterAuthIdentityResolver(auth, req),
      organizations,
      new Reflector(),
    );
  };

  const request = (tenant?: string, session?: Session): Request => ({
    headers: tenant ? { 'x-tenant': tenant } : {},
    ...(session && { session }),
  });

  const who = (
    id: string,
    activeOrganizationId: string | null = null,
  ): Session => ({
    user: { id, email: `${id}@example.com`, name: id },
    session: { activeOrganizationId },
  });

  const ana = (activeOrganizationId: string | null): Session =>
    who('ana', activeOrganizationId);

  beforeEach(() => {
    sessionsAsked = 0;
    membershipsAsked = [];
  });

  it('lets anybody into the root tenant, signed in or not, without asking who they are', async () => {
    const req = request();

    await expect(guard(req).canActivate(graphqlContext(req))).resolves.toBe(
      true,
    );
    expect(sessionsAsked).toBe(0);
  });

  it('lets a member into the organization’s tenant', async () => {
    const req = request('Acme');

    await expect(
      guard(req, who('ana')).canActivate(graphqlContext(req)),
    ).resolves.toBe(true);
  });

  it('refuses whoever is not a member, and whoever has no session', async () => {
    const bia = request('acme');
    const nobody = request('acme');

    await expect(
      guard(bia, who('bia')).canActivate(graphqlContext(bia)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard(nobody, null).canActivate(graphqlContext(nobody)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('asks nobody who a caller presenting no credentials is', async () => {
    const req = request('acme');

    await expect(
      guard(req, who('ana')).canActivate(graphqlContext(req, 'events', {})),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionsAsked).toBe(0);
  });

  it('reads the session the authentication guard already put on the request, when it ran first', async () => {
    const req = request('acme', who('ana'));

    await guard(req, null).canActivate(graphqlContext(req));

    expect(sessionsAsked).toBe(0);
    expect(membershipsAsked.map((id) => id.value)).toEqual(['ana']);
  });

  it('decides once per request, however many field resolvers it guards', async () => {
    const req = request('acme');
    const membership = guard(req, who('ana'));

    await membership.canActivate(graphqlContext(req));
    await membership.canActivate(graphqlContext(req));

    expect(sessionsAsked).toBe(1);
    expect(membershipsAsked).toHaveLength(1);
  });

  describe('on a handler checked against the active organization', () => {
    it('lets the caller work in the tenant of the organization that is active', async () => {
      const req = request('acme');

      await expect(
        guard(req, ana('org_acme')).canActivate(
          graphqlContext(req, 'updateEvent'),
        ),
      ).resolves.toBe(true);
    });

    it('refuses another tenant of theirs, where the role checked would not be the one held', async () => {
      for (const handler of [
        'updateEvent',
        'deleteOrganization',
        'activeOrganization',
      ] as const) {
        const req = request('initech');

        await expect(
          guard(req, ana('org_acme')).canActivate(graphqlContext(req, handler)),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('refuses the root tenant, which is no organization, and a session with none active', async () => {
      const root = request();
      const noneActive = request('acme');

      await expect(
        guard(root, ana('org_acme')).canActivate(
          graphqlContext(root, 'updateEvent'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        guard(noneActive, ana(null)).canActivate(
          graphqlContext(noneActive, 'updateEvent'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('leaves every other handler free to name any tenant of theirs', async () => {
      const req = request('initech');

      await expect(
        guard(req, ana('org_acme')).canActivate(graphqlContext(req)),
      ).resolves.toBe(true);
    });

    it('asks for the session once, however many of its checks need it', async () => {
      const req = request('acme');

      await guard(req, ana('org_acme')).canActivate(
        graphqlContext(req, 'updateEvent'),
      );

      expect(sessionsAsked).toBe(1);
    });
  });

  it('lets a message through: its publisher already checked the tenant it carries', async () => {
    const message = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;

    await expect(guard(request()).canActivate(message)).resolves.toBe(true);
  });
});
