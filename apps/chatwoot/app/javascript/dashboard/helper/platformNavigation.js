export const PLATFORM_NAVIGATE = 'PLATFORM_NAVIGATE';

export function openInPlatform(url) {
  if (window.parent === window) {
    window.location.assign(url);
    return;
  }
  const { pathname, search } = new URL(url, window.location.origin);
  window.parent.postMessage(
    { type: PLATFORM_NAVIGATE, path: `${pathname}${search}` },
    '*'
  );
}
