<script setup>
import { computed, nextTick, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useUISettings } from 'dashboard/composables/useUISettings';

import { Spinner } from 'dashboard/components-next/ui/spinner';

const store = useStore();
const { currentParams, visit } = useAppNavigation();
const { uiSettings } = useUISettings();

const portals = computed(() => store.getters['portals/allPortals']);

const isPortalPresent = portalSlug => {
  return !!portals.value.find(portal => portal.slug === portalSlug);
};

const routeToView = (name, params) => {
  visit({ name, params });
};

const generateRouterParams = () => {
  const {
    last_active_portal_slug: lastActivePortalSlug,
    last_active_locale_code: lastActiveLocaleCode,
  } = uiSettings.value || {};
  if (isPortalPresent(lastActivePortalSlug)) {
    return {
      portalSlug: lastActivePortalSlug,
      locale: lastActiveLocaleCode,
    };
  }

  if (portals.value.length > 0) {
    const { slug: portalSlug, meta: { default_locale: locale } = {} } =
      portals.value[0];
    return { portalSlug, locale };
  }

  return null;
};

const routeToLastActivePortal = () => {
  const params = generateRouterParams();
  const { navigationPath } = currentParams.value;
  const isAValidRoute = [
    'portals_articles_index',
    'portals_categories_index',
    'portals_locales_index',
    'portals_settings_index',
  ].includes(navigationPath);

  const navigateTo = isAValidRoute ? navigationPath : 'portals_articles_index';
  if (params) {
    return routeToView(navigateTo, params);
  }
  return routeToView('portals_new', {});
};

const performRouting = async () => {
  await store.dispatch('portals/index');
  nextTick(() => routeToLastActivePortal());
};

onMounted(() => performRouting());
</script>

<template>
  <div
    class="flex items-center justify-center w-full bg-n-surface-1 text-n-slate-11"
  >
    <Spinner class="size-6" />
  </div>
</template>
