<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter, useStore } from 'dashboard/composables/store.js';
import allLocales from 'shared/constants/locales.js';
import { getArticleStatus } from 'dashboard/helper/portalHelper.js';
import ArticlesPage from 'dashboard/components-next/HelpCenter/Pages/ArticlePage/ArticlesPage.vue';

const { currentParams, currentRouteName } = useAppNavigation();
const store = useStore();

const pageNumber = ref(1);

const articles = useMapGetter('articles/allArticles');
const categories = useMapGetter('categories/allCategories');
const meta = useMapGetter('articles/getMeta');
const portalMeta = useMapGetter('portals/getMeta');
const currentUserId = useMapGetter('getCurrentUserID');
const getPortalBySlug = useMapGetter('portals/portalBySlug');

const selectedPortalSlug = computed(() => currentParams.value.portalSlug);
const selectedCategorySlug = computed(() => currentParams.value.categorySlug);
const status = computed(() => getArticleStatus(currentParams.value.tab));

const author = computed(() =>
  currentParams.value.tab === 'mine' ? currentUserId.value : null
);

const activeLocale = computed(() => currentParams.value.locale);
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

const defaultPortalLocale = computed(() => {
  return portal.value?.meta?.default_locale;
});

const selectedLocaleInPortal = computed(() => {
  return currentParams.value.locale || defaultPortalLocale.value;
});

const isCategoryArticles = computed(() => {
  return (
    currentRouteName.value === 'portals_categories_articles_index' ||
    currentRouteName.value === 'portals_categories_articles_edit' ||
    currentRouteName.value === 'portals_categories_index'
  );
});

const fetchArticles = ({ pageNumber: pageNumberParam } = {}) => {
  store.dispatch('articles/index', {
    pageNumber: pageNumberParam || pageNumber.value,
    portalSlug: selectedPortalSlug.value,
    locale: activeLocale.value,
    status: status.value,
    authorId: author.value,
    categorySlug: selectedCategorySlug.value,
  });
};

const onPageChange = pageNumberParam => {
  fetchArticles({ pageNumber: pageNumberParam });
};

const fetchPortalAndItsCategories = async locale => {
  await store.dispatch('portals/index');
  const selectedPortalParam = {
    portalSlug: selectedPortalSlug.value,
    locale: locale || selectedLocaleInPortal.value,
  };
  store.dispatch('portals/show', selectedPortalParam);
  store.dispatch('categories/index', selectedPortalParam);
  store.dispatch('agents/get');
};

onMounted(() => {
  fetchArticles();
});

watch(
  () => currentParams.value,
  () => {
    pageNumber.value = 1;
    fetchArticles();
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <div class="w-full h-full">
    <ArticlesPage
      v-if="portal"
      :articles="articles"
      :portal-name="portal.name"
      :categories="categories"
      :allowed-locales="allowedLocales"
      :meta="meta"
      :portal-meta="portalMeta"
      :is-category-articles="isCategoryArticles"
      @page-change="onPageChange"
      @fetch-portal="fetchPortalAndItsCategories"
    />
  </div>
</template>
