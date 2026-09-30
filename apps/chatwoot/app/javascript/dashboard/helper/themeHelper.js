import { LocalStorage } from 'shared/helpers/localStorage';
import { LOCAL_STORAGE_KEYS } from 'dashboard/constants/localStorage';

// Toggle `.dark` on BOTH <html> and <body>.
// <html> (the :root) is REQUIRED for Tailwind v4: the @theme colour variables
// (`--color-*`) are declared at :root and reference the raw tokens via var()
// (e.g. `--color-background: oklch(var(--background))`). They compute at :root,
// so the dark token overrides must be in scope there — `.dark` on <body> alone
// leaves every `--color-*` resolved against the light :root tokens.
// <body> is kept so existing `body.dark` scoped styles (captain SVGs, command
// bar) keep matching.
const applyDark = isDark => {
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
  document.documentElement.style.setProperty(
    'color-scheme',
    isDark ? 'dark' : 'light'
  );
};

export const setColorTheme = isOSOnDarkMode => {
  const selectedColorScheme =
    LocalStorage.get(LOCAL_STORAGE_KEYS.COLOR_SCHEME) || 'auto';
  const isDark =
    (selectedColorScheme === 'auto' && isOSOnDarkMode) ||
    selectedColorScheme === 'dark';

  applyDark(isDark);
};

const prefersDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/**
 * Keep the color theme in sync and react to changes.
 *
 * - **Standalone:** follow the OS `prefers-color-scheme` (+ the stored
 *   COLOR_SCHEME preference) and OBSERVE OS changes. The old SPA App.vue had this
 *   `matchMedia` listener; the Inertia migration replaced App.vue with AppShell,
 *   which only called `setColorTheme` once on mount and dropped the observer — so
 *   the theme stopped reacting.
 * - **Embedded (apps/web `/atendimento` iframe):** the host owns the theme
 *   (next-themes, `class` strategy, independent of the OS). We can't read it from
 *   inside the iframe via `prefers-color-scheme`, so we apply whatever the host
 *   posts (`CHATWOOT_SET_THEME`) and ask for the current value on boot
 *   (`CHATWOOT_REQUEST_THEME`) in case we mounted after the host settled.
 *
 * @returns {() => void} teardown that removes the listener it registered.
 */
export const setupThemeSync = () => {
  if (typeof window === 'undefined') return () => {};

  const mql = prefersDarkQuery();
  const isEmbedded = window.parent !== window;

  if (isEmbedded) {
    // Initial paint from the OS until the host replies (minimizes any flash).
    setColorTheme(mql.matches);

    const onHostMessage = event => {
      const { type, theme } = event.data ?? {};
      if (type === 'CHATWOOT_SET_THEME' && (theme === 'dark' || theme === 'light')) {
        applyDark(theme === 'dark');
      }
    };
    window.addEventListener('message', onHostMessage);
    window.parent.postMessage({ type: 'CHATWOOT_REQUEST_THEME' }, '*');

    return () => window.removeEventListener('message', onHostMessage);
  }

  setColorTheme(mql.matches);
  const onOSChange = event => setColorTheme(event.matches);
  mql.addEventListener('change', onOSChange);

  return () => mql.removeEventListener('change', onOSChange);
};
