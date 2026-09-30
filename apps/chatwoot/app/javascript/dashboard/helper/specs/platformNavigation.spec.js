import { openInPlatform, PLATFORM_NAVIGATE } from '../platformNavigation';

describe('openInPlatform', () => {
  const ORGANIZATIONS = 'https://platform.example/settings/organizations?x=1';
  let parentDescriptor;
  let locationDescriptor;

  beforeEach(() => {
    parentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
    locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', parentDescriptor);
    Object.defineProperty(window, 'location', locationDescriptor);
  });

  it('opens the page itself when Chatwoot is not framed', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    openInPlatform(ORGANIZATIONS);

    expect(assign).toHaveBeenCalledWith(ORGANIZATIONS);
  });

  it('asks the framing platform to navigate, by path, when Chatwoot is embedded', () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage },
    });

    openInPlatform(ORGANIZATIONS);

    expect(postMessage).toHaveBeenCalledWith(
      { type: PLATFORM_NAVIGATE, path: '/settings/organizations?x=1' },
      '*'
    );
  });
});
