import {
  CLIENT_RESOURCE,
  EVENT_RESOURCE,
  KEEP_CLIENTS,
  MANAGE_CLIENTS,
  MANAGE_EVENTS,
  organizationRoles,
} from './access';

describe('who manages an organization’s calendar', () => {
  const grants = (
    role: keyof typeof organizationRoles,
    actions: readonly (typeof MANAGE_EVENTS)[number][],
  ) =>
    organizationRoles[role].authorize({ [EVENT_RESOURCE]: [...actions] })
      .success;

  it('is its owners and its admins, for every event of it', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(grants(role, MANAGE_EVENTS)).toBe(true);
    }
  });

  it('is not a member, who plans only their own events', () => {
    for (const action of MANAGE_EVENTS) {
      expect(grants('member', [action])).toBe(false);
    }
  });
});

describe('who keeps an organization’s clients', () => {
  const grants = (
    role: keyof typeof organizationRoles,
    actions: readonly (typeof MANAGE_CLIENTS)[number][],
  ) =>
    organizationRoles[role].authorize({ [CLIENT_RESOURCE]: [...actions] })
      .success;

  it('is its owners and its admins, removing ones included', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(grants(role, MANAGE_CLIENTS)).toBe(true);
    }
  });

  it('is every member too, who reads, registers and revises but never removes', () => {
    expect(grants('member', KEEP_CLIENTS)).toBe(true);
    expect(grants('member', ['delete'])).toBe(false);
  });
});
