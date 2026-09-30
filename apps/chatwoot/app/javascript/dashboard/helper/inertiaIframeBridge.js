import { router } from '@inertiajs/vue3';

// Microfrontend URL sync for the apps/web "/atendimento" iframe.
//
// The vue-router SPA used to mirror navigation to the host via `router.afterEach` and
// listen for host-driven navigation — that lived in the now-deleted routes/index.js. The
// vue-router teardown removed it, so the host URL stopped tracking in-iframe navigation.
// This replicates it with Inertia's `navigate` router event.
//
// Contract (see apps/web/.../atendimento/_components/chatwoot-embed.tsx):
//   - iframe -> host: postMessage({ type: 'CHATWOOT_URL_CHANGE', path }) so the host keeps
//     its address bar + browser history in sync with the iframe route.
//   - host -> iframe: message({ type: 'NAVIGATE_CHATWOOT', path }) to drive navigation
//     (e.g. "Ver no Atendimento" deep links).
export function setupInertiaIframeBridge() {
  // Only relevant when embedded — standalone, window.parent === window (nothing to sync).
  if (typeof window === 'undefined' || window.parent === window) return;

  const postPathToHost = path => {
    if (path) {
      window.parent.postMessage({ type: 'CHATWOOT_URL_CHANGE', path }, '*');
    }
  };

  // Mirror every Inertia navigation (page.url includes the query string, same shape the
  // old vue-router `to.fullPath` posted).
  router.on('navigate', event => {
    postPathToHost(event.detail?.page?.url);
  });

  // Sync the current path once on boot so the host settles even if it (re)mounted the
  // iframe after the initial navigation fired.
  postPathToHost(window.location.pathname + window.location.search);

  // Host-driven navigation into the iframe.
  window.addEventListener('message', event => {
    if (
      event.data?.type === 'NAVIGATE_CHATWOOT' &&
      typeof event.data?.path === 'string'
    ) {
      router.visit(event.data.path);
    }
  });
}
