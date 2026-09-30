<script setup>
// Minimal full-screen Inertia layout with NO sidebar — for standalone pages like
// account-suspended and no-accounts that render outside the app shell. Bootstraps the
// user + globalConfig into the store (so pages can read getCurrentUser / isOnChatwootCloud)
// and sets dir/theme like App.vue, but deliberately omits NextSidebar and the
// account-required gate (no-accounts has no account at all).
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { setupThemeSync } from 'dashboard/helper/themeHelper';
import { Toaster } from 'next/ui/sonner';
import 'vue-sonner/style.css';

const store = useStore();
const { locale } = useI18n({ useScope: 'global' });
const isRTL = computed(() => store.getters['accounts/isRTL']);

let teardownThemeSync = () => {};
onBeforeUnmount(() => teardownThemeSync());

onMounted(async () => {
  locale.value = 'pt_BR';
  teardownThemeSync = setupThemeSync();
  try {
    await store.dispatch('setUser');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[inertia] BlankLayout setUser failed', error);
  }
});
</script>

<template>
  <div
    class="flex w-full h-screen min-h-0 overflow-hidden bg-n-background text-n-slate-12"
    :dir="isRTL ? 'rtl' : 'ltr'"
  >
    <slot />
    <Toaster />
  </div>
</template>
