import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import {
  AllowAnonymous,
  MemberHasPermission,
  OptionalAuth,
  RequireActiveOrg,
  Roles,
} from '@thallesp/nestjs-better-auth';

import { RequireScopes } from '../decorators/require-scopes.decorator';
import type { IdentityResolver } from '../domain/auth/identity.resolver';
import { ClientIdentity } from '../domain/auth/vo/client-identity';
import type { Identity } from '../domain/auth/vo/identity';
import { BetterAuthIdentityResolver } from '../infrastructure/better-auth/identity/better-auth-identity.resolver';
import type { BetterAuth } from '../infrastructure/better-auth/init-auth';
import { PlatformAuthGuard } from './platform-auth.guard';

class ClientsResolver {
  @RequireScopes('read:clients')
  clients() {}

  @RequireScopes('write:posts')
  @Roles(['author'])
  createPost() {}

  @RequireScopes('read:clients')
  @MemberHasPermission({ permissions: { client: ['delete'] } })
  deleteClient() {}

  @RequireScopes('read:clients')
  @RequireActiveOrg()
  activeClients() {}

  me() {}

  @AllowAnonymous()
  posts() {}

  @OptionalAuth()
  feed() {}
}

const token = (claims: Record<string, unknown>) =>
  [{ alg: 'ES256', typ: 'at+jwt' }, claims, 'signature']
    .map((part) =>
      Buffer.from(
        typeof part === 'string' ? part : JSON.stringify(part),
      ).toString('base64url'),
    )
    .join('.');

const CLIENT_TOKEN = token({ sub: 'machine', client_id: 'machine' });

describe('PlatformAuthGuard', () => {
  const machine = (activeOrganizationId: string | null = 'org-acme') =>
    ClientIdentity.parse({
      clientId: 'machine',
      scopes: ['read:clients'],
      activeOrganizationId,
    });

  const verdictOf = async (
    handler: () => void,
    {
      caller = null,
      authorization,
      session = null,
    }: {
      caller?: Identity | null;
      authorization?: string;
      session?: unknown;
    },
  ) => {
    const request: Record<PropertyKey, unknown> = {
      headers: authorization ? { authorization } : { cookie: 'session=abc' },
    };
    const auth = {
      api: { getSession: async () => session },
    } as unknown as BetterAuth;
    const resolver = { identity: async () => caller } as IdentityResolver;
    const guard = new PlatformAuthGuard(new Reflector(), auth, resolver);
    const verdict = await guard
      .canActivate(
        new ExecutionContextHost([request], ClientsResolver, handler),
      )
      .catch((refusal: unknown) => refusal);
    return { verdict, request };
  };

  const asClient = (caller: Identity | null) => ({
    caller,
    authorization: `Bearer ${CLIENT_TOKEN}`,
  });

  it('admits a client on an operation that declares the scopes it requires, and records it on the request', async () => {
    const client = machine();

    const { verdict, request } = await verdictOf(
      ClientsResolver.prototype.clients,
      asClient(client),
    );

    expect(verdict).toBe(true);
    expect(BetterAuthIdentityResolver.guardedIdentityOf(request)).toBe(client);
  });

  it('refuses a client on an operation that requires no scope', async () => {
    const { verdict } = await verdictOf(
      ClientsResolver.prototype.me,
      asClient(machine()),
    );

    expect(verdict).toBeInstanceOf(ForbiddenException);
  });

  it('refuses a client on an operation for users or members, whatever scopes it declares', async () => {
    for (const handler of [
      ClientsResolver.prototype.createPost,
      ClientsResolver.prototype.deleteClient,
    ]) {
      const { verdict } = await verdictOf(handler, asClient(machine()));

      expect(verdict).toBeInstanceOf(ForbiddenException);
    }
  });

  it('requires an organization of a client where the operation requires an active one', async () => {
    const bound = await verdictOf(
      ClientsResolver.prototype.activeClients,
      asClient(machine()),
    );
    const unbound = await verdictOf(
      ClientsResolver.prototype.activeClients,
      asClient(machine(null)),
    );

    expect(bound.verdict).toBe(true);
    expect(unbound.verdict).toBeInstanceOf(ForbiddenException);
  });

  it('lets a client through where anybody may call, and a refused token only where nobody may', async () => {
    const open = await verdictOf(
      ClientsResolver.prototype.posts,
      asClient(null),
    );
    const optional = await verdictOf(
      ClientsResolver.prototype.feed,
      asClient(null),
    );
    const guarded = await verdictOf(
      ClientsResolver.prototype.clients,
      asClient(null),
    );

    expect(open.verdict).toBe(true);
    expect(optional.verdict).toBe(true);
    expect(guarded.verdict).toBeInstanceOf(UnauthorizedException);
  });

  it('leaves every caller with a session to the library’s own guard', async () => {
    const user = {
      user: {
        id: 'ana',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'author',
      },
      session: { activeOrganizationId: 'org-acme' },
    };

    const signedIn = await verdictOf(ClientsResolver.prototype.createPost, {
      session: user,
    });
    const nobody = await verdictOf(ClientsResolver.prototype.me, {});
    const userToken = await verdictOf(ClientsResolver.prototype.me, {
      authorization: `Bearer ${token({ sub: 'ana', client_id: 'machine' })}`,
      session: user,
    });

    expect(signedIn.verdict).toBe(true);
    expect(signedIn.request.session).toBe(user);
    expect(nobody.verdict).toBeInstanceOf(UnauthorizedException);
    expect(userToken.verdict).toBe(true);
  });
});
