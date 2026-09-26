import { EVENT_RESOURCE, MANAGE_EVENTS, organizationRoles } from './access';

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
