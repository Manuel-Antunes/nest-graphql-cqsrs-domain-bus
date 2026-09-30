import { z } from 'zod';

import { IdentityIsNotAUserException } from '../exception/identity-is-not-a-user.exception';
import { SessionNotAuthenticatedException } from '../exception/session-not-authenticated.exception';
import { ClientIdentity } from './client-identity';
import type { Identity } from './identity';
import { IdentityAttribute } from './identity-attribute';
import { UserIdentity } from './user-identity';

describe('Identity', () => {
  const ana = UserIdentity.parse({
    userId: 'ana',
    email: 'ana@example.com',
    name: 'Ana',
    roles: ['user', 'author'],
    scopes: ['openid', 'read:posts'],
    activeOrganizationId: 'org-acme',
  });
  const machine = ClientIdentity.parse({
    clientId: 'chatwoot-agent-bot-7',
    scopes: ['write:conversations'],
    activeOrganizationId: 'org-acme',
    attributes: { agent_bot_id: '7', plan: 'pro' },
    credential: {
      type: 'access-token',
      tokenId: 'jti-1',
      expiresAt: new Date('2026-10-01T12:00:00Z'),
    },
  });

  it('tells a person from an OAuth client by its kind, and names each by its principal', () => {
    const kinds = ([ana, machine] as Identity[]).map((identity) => [
      identity.kind,
      identity.principal,
    ]);

    expect(kinds).toEqual([
      ['user', 'ana'],
      ['client', 'chatwoot-agent-bot-7'],
    ]);
  });

  it('holds a session as its credential, and no attributes, unless told otherwise', () => {
    expect(ana.credential).toMatchObject({ type: 'session' });
    expect(ana.attributes).toEqual({});
    expect(machine.roles).toEqual([]);
  });

  it('answers roles and scopes the same way for every kind', () => {
    expect(ana.hasAnyRole(['admin', 'author'])).toBe(true);
    expect(ana.hasScopes(['openid', 'read:posts'])).toBe(true);
    expect(machine.hasScopes(['write:conversations'])).toBe(true);
    expect(machine.hasScopes(['read:posts'])).toBe(false);
    expect(machine.hasAnyRole(['author'])).toBe(false);
  });

  describe('attributes', () => {
    const AgentBotId = IdentityAttribute.of(
      'agent_bot_id',
      z.coerce.number().int().positive(),
    );
    const Seats = IdentityAttribute.of('seats', z.number());

    it('reads one typed, through the schema its reader declared', () => {
      expect(machine.attribute(AgentBotId)).toBe(7);
    });

    it('reads a missing or invalid one as undefined, never as a failure', () => {
      expect(machine.attribute(Seats)).toBeUndefined();
      expect(ana.attribute(AgentBotId)).toBeUndefined();
      expect(
        IdentityAttribute.of('plan', z.number()).readFrom(machine.attributes),
      ).toBeUndefined();
    });
  });

  describe('UserIdentity.required', () => {
    it('is the caller when it is a person', () => {
      expect(UserIdentity.required(ana)).toBe(ana);
    });

    it('refuses nobody as unauthenticated, and a client as no user', () => {
      expect(() => UserIdentity.required(null)).toThrow(
        SessionNotAuthenticatedException,
      );
      expect(() => UserIdentity.required(machine)).toThrow(
        IdentityIsNotAUserException,
      );
    });
  });
});
