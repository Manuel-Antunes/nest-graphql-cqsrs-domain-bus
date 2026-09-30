<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter, useStore } from 'dashboard/composables/store.js';
import { buildPortalURL } from 'dashboard/helper/portalHelper';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';

const emit = defineEmits(['close', 'createPortal']);

const { t } = useI18n();
const { currentParams, currentRouteName, visit } = useAppNavigation();
const store = useStore();

const DEFAULT_ROUTE = 'portals_articles_index';
const CATEGORY_ROUTE = 'portals_categories_index';
const CATEGORY_SUB_ROUTES = [
  'portals_categories_articles_index',
  'portals_categories_articles_new',
  'portals_categories_articles_edit',
];

const portals = useMapGetter('portals/allPortals');

const currentPortalSlug = computed(() => currentParams.value.portalSlug);

const portalLink = computed(() => {
  return buildPortalURL(currentPortalSlug.value);
});

const isPortalActive = portal => {
  return portal.slug === currentPortalSlug.value;
};

const getPortalThumbnailSrc = portal => {
  return portal?.logo?.file_url || '';
};

const fetchPortalAndItsCategories = async (slug, locale) => {
  await store.dispatch('portals/switchPortal', true);
  await store.dispatch('portals/index');
  const selectedPortalParam = {
    portalSlug: slug,
    locale,
  };
  await store.dispatch('portals/show', selectedPortalParam);
  await store.dispatch('categories/index', selectedPortalParam);
  await store.dispatch('agents/get');
  await store.dispatch('portals/switchPortal', false);
};

const handlePortalChange = async portal => {
  if (isPortalActive(portal)) return;
  const {
    slug,
    meta: { default_locale: defaultLocale },
  } = portal;
  emit('close');
  await fetchPortalAndItsCategories(slug, defaultLocale);
  const targetRouteName = CATEGORY_SUB_ROUTES.includes(currentRouteName.value)
    ? CATEGORY_ROUTE
    : currentRouteName.value || DEFAULT_ROUTE;
  visit({
    name: targetRouteName,
    params: {
      portalSlug: slug,
      locale: defaultLocale,
    },
  });
};

const openCreatePortalDialog = () => {
  emit('createPortal');
  emit('close');
};

const onClickPreviewPortal = () => {
  window.open(portalLink.value, '_blank');
};

const redirectToPortalHomePage = () => {
  visit({
    name: 'portals_index',
    params: {
      navigationPath: DEFAULT_ROUTE,
    },
  });
};
</script>

<template>
  <div
    class="pt-5 bg-n-alpha-3 backdrop-blur-[100px] outline outline-n-container outline-1 z-50 absolute w-[27.5rem] max-h-96 rounded-xl shadow-md flex flex-col gap-4"
  >
    <div
      class="flex items-center justify-between gap-4 px-6 pb-3 border-b border-n-alpha-2"
    >
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <h2
            class="text-base font-medium cursor-pointer text-n-slate-12 w-fit hover:underline"
            @click="redirectToPortalHomePage"
          >
            {{ t('HELP_CENTER.PORTAL_SWITCHER.PORTALS') }}
          </h2>
          <Button variant="ghost" size="icon" @click="onClickPreviewPortal">
            <Icon icon="i-lucide-arrow-up-right" />
          </Button>
        </div>
        <p class="text-sm text-n-slate-11">
          {{ t('HELP_CENTER.PORTAL_SWITCHER.CREATE_PORTAL') }}
        </p>
      </div>
      <Button variant="outline" @click="openCreatePortalDialog">
        <Icon icon="i-lucide-plus" />
        {{ t('HELP_CENTER.PORTAL_SWITCHER.NEW_PORTAL') }}
      </Button>
    </div>
    <div
      v-if="portals.length > 0"
      class="flex flex-col flex-1 min-h-0 gap-2 px-4 pb-3 overflow-y-auto overscroll-contain"
    >
      <Button
        v-for="(portal, index) in portals"
        :key="index"
        variant="ghost"
        @click="handlePortalChange(portal)"
      >
        <div v-if="portal.custom_domain" class="flex items-center gap-1">
          <span class="i-lucide-link size-3" />
          <span class="text-sm truncate text-n-slate-11">
            {{ portal.custom_domain || '' }}
          </span>
        </div>
        <span class="text-sm font-medium truncate text-n-slate-12">
          {{ portal.name || '' }}
        </span>
        <Avatar
          v-if="portal"
          :name="portal.name"
          :src="getPortalThumbnailSrc(portal)"
          :size="20"
          icon-name="i-lucide-building-2"
        />
        <Icon v-if="isPortalActive(portal)" icon="i-lucide-check" />
      </Button>
    </div>
  </div>
</template>
