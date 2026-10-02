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

describe('Chatwoot.frameUrlOf', () => {
  it('opens the dashboard, never the root, which on a shared origin is the platform', () => {
    expect(Chatwoot.frameUrlOf('https://router.example', '')).toBe(
      'https://router.example/app',
    );
    expect(Chatwoot.frameUrlOf('http://localhost:3100/', '')).toBe(
      'http://localhost:3100/app',
    );
  });

  it('opens a path of the dashboard where it is asked to', () => {
    expect(
      Chatwoot.frameUrlOf(
        'https://router.example',
        '/app/accounts/3/contacts/7',
      ),
    ).toBe('https://router.example/app/accounts/3/contacts/7');
  });
});
