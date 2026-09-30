<script setup>
// Persistent Inertia layout (docs §6). Survives page visits, so the store bootstrap +
// ActionCable live here, NOT in a page component. Renders the real NextSidebar, now
// vue-router-free (it navigates + gates via the registry / useAppNavigation).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import NextSidebar from 'next/sidebar/Sidebar.vue';
import MobileSidebarLauncher from 'dashboard/components-next/sidebar/MobileSidebarLauncher.vue';
import LoadingState from 'dashboard/components/widgets/LoadingState.vue';
import vueActionCable from 'dashboard/helper/actionCable';
import { setupThemeSync } from 'dashboard/helper/themeHelper';
import { Toaster } from 'next/ui/sonner';
import 'vue-sonner/style.css';

const store = useStore();
const { locale } = useI18n({ useScope: 'global' });

// Mobile sidebar toggle state — the SPA's Dashboard.vue owns this and renders the
// MobileSidebarLauncher; AppShell replaced Dashboard.vue, so it must too or the mobile
// menu button never appears (launcher hides itself on conversation routes by design).
const isMobileSidebarOpen = ref(false);
const toggleMobileSidebar = () => {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value;
};
const closeMobileSidebar = () => {
  isMobileSidebarOpen.value = false;
};

// The SPA's App.vue sets `:dir` on its #app root; every `ltr:`/`rtl:` Tailwind variant
// in the app (e.g. the sidebar's `ltr:border-r`) resolves against it. Inertia has no
// App.vue, so replicate it here on the outermost layout or those variants never match
// and borders/directional spacing silently disappear.
const isRTL = computed(() => store.getters['accounts/isRTL']);

// Gate the shell until the account is loaded — mirrors App.vue's
// `!accountUIFlags.isFetchingItem` guard. Pages read currentAccount synchronously
// (e.g. settings/account AccountId.vue), so rendering before accounts/get resolves
// would crash them.
const isReady = ref(false);

// accountId from the URL (matches ApiClient.accountIdFromRoute) — no vue-router needed.
const accountIdFromPath = () => {
  const parts = window.location.pathname.split('/');
  const idx = parts.indexOf('accounts');
  const id = idx >= 0 ? Number(parts[idx + 1]) : NaN;
  return Number.isNaN(id) ? null : id;
};

let teardownThemeSync = () => {};
onBeforeUnmount(() => teardownThemeSync());

onMounted(async () => {
  // Force pt_BR, same as App.vue.
  locale.value = 'pt_BR';
  // Apply + keep the theme in sync (OS observer when standalone, host-driven when
  // embedded in the apps/web iframe). App.vue used to own this; AppShell must too.
  teardownThemeSync = setupThemeSync();

  try {
    // setUser reads the cw_d_session_info cookie (present standalone AND embedded).
    await store.dispatch('setUser');

    const accountId = accountIdFromPath();
    if (accountId) {
      await store.dispatch('accounts/get');
      store.dispatch('setActiveAccount', { accountId });

      const pubsubToken = store.getters.getCurrentUser?.pubsub_token;
      if (pubsubToken) {
        try {
          vueActionCable.init(store, pubsubToken);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[inertia] ActionCable init failed', error);
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[inertia] store bootstrap failed', error);
  } finally {
    isReady.value = true;
  }
});
</script>

<template>
  <div
    class="flex w-full h-screen min-h-0 overflow-hidden bg-n-background text-n-slate-12"
    :dir="isRTL ? 'rtl' : 'ltr'"
  >
    <template v-if="isReady">
      <NextSidebar
        :is-mobile-sidebar-open="isMobileSidebarOpen"
        @close-mobile-sidebar="closeMobileSidebar"
      />
      <!-- Mirrors Dashboard.vue's <main>: overflow-hidden (pages own their scroll) +
           min-w-0 so flex children shrink instead of forcing a page-wide x-scroll. -->
      <main class="flex flex-1 w-full h-full min-w-0 min-h-0 overflow-hidden">
        <slot />
        <MobileSidebarLauncher
          :is-mobile-sidebar-open="isMobileSidebarOpen"
          @toggle="toggleMobileSidebar"
        />
      </main>
    </template>
    <LoadingState v-else class="w-full" />
    <Toaster />
  </div>
</template>

<style lang="scss">
/* Global tweaks the SPA applies via App.vue's <style> — replicated so Inertia pages
   match (tooltip styling + multiselect input spacing). */
.v-popper--theme-tooltip .v-popper__inner {
  background: black !important;
  font-size: 0.75rem;
  padding: 4px 8px !important;
  border-radius: 6px;
  font-weight: 400;
}

.v-popper--theme-tooltip .v-popper__arrow-container {
  display: none;
}

.multiselect__input {
  margin-bottom: 0px !important;
}
</style>
