import { describe, expect, it } from 'vitest';

import { Chatwoot } from './chatwoot';

describe('Chatwoot.platformPathOf', () => {
  const navigate = (path: unknown) => ({
    type: Chatwoot.PLATFORM_NAVIGATE,
    path,
  });

  it('answers a path of the platform the embedded dashboard asks to open', () => {
    expect(
      Chatwoot.platformPathOf(navigate('/settings/organizations?tab=new')),
    ).toBe('/settings/organizations?tab=new');
  });

  it.each([
    'https://evil.example/settings',
    '//evil.example/settings',
    '/\\evil.example',
    'javascript:alert(1)',
    'settings/organizations',
    '',
  ])('refuses %j, which is not a path of this origin', (path) => {
    expect(Chatwoot.platformPathOf(navigate(path))).toBeNull();
  });

  it('ignores every other message the dashboard posts', () => {
    expect(
      Chatwoot.platformPathOf({ type: 'CHATWOOT_URL_CHANGE', path: '/app' }),
    ).toBeNull();
    expect(Chatwoot.platformPathOf(navigate(42))).toBeNull();
    expect(Chatwoot.platformPathOf(null)).toBeNull();
    expect(Chatwoot.platformPathOf('PLATFORM_NAVIGATE')).toBeNull();
  });
});
