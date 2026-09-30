import { createI18n } from 'vue-i18n';
import messages from 'dashboard/i18n';

// Single shared i18n instance for the dashboard app. Exported so non-setup
// code (helpers, plain modules) can translate via `i18n.global.t` — the app
// entrypoint installs this same instance, so runtime locale changes stay in sync.
export const i18n = createI18n({
  legacy: false, // https://github.com/intlify/vue-i18n/issues/1902
  locale: 'pt_BR',
  fallbackLocale: 'en',
  messages,
});
