<script setup>
import { computed, onMounted } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter, useStore } from 'dashboard/composables/store.js';
import allLocales from 'shared/constants/locales.js';

import CategoriesPage from 'dashboard/components-next/HelpCenter/Pages/CategoryPage/CategoriesPage.vue';

const store = useStore();
const { currentParams } = useAppNavigation();

const categories = useMapGetter('categories/allCategories');

const selectedPortalSlug = computed(() => currentParams.value.portalSlug);
const getPortalBySlug = useMapGetter('portals/portalBySlug');

const isFetching = useMapGetter('categories/isFetching');

const portal = computed(() => getPortalBySlug.value(selectedPortalSlug.value));

const allowedLocales = computed(() => {
  if (!portal.value) {
    return [];
  }
  const { allowed_locales: allAllowedLocales } = portal.value.config;
  return allAllowedLocales.map(locale => {
    return {
      id: locale.code,
      name: allLocales[locale.code],
      code: locale.code,
    };
  });
});

const fetchCategoriesByPortalSlugAndLocale = async localeCode => {
  await store.dispatch('categories/index', {
    portalSlug: selectedPortalSlug.value,
    locale: localeCode,
  });
};

const updateMeta = async localeCode => {
  return store.dispatch('portals/show', {
    portalSlug: selectedPortalSlug.value,
    locale: localeCode,
  });
};

const fetchCategories = async localeCode => {
  await fetchCategoriesByPortalSlugAndLocale(localeCode);
  await updateMeta(localeCode);
};

onMounted(() => {
  fetchCategoriesByPortalSlugAndLocale(currentParams.value.locale);
});
</script>

<template>
  <CategoriesPage
    :categories="categories"
    :is-fetching="isFetching"
    :allowed-locales="allowedLocales"
    @fetch-categories="fetchCategories"
  />
</template>
