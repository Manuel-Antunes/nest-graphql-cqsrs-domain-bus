<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import { useAlert, useTrack } from 'dashboard/composables';
import { PORTALS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { buildPortalArticleURL } from 'dashboard/helper/portalHelper';
import { useStore, useMapGetter } from 'dashboard/composables/store';

import ArticleEditor from 'dashboard/components-next/HelpCenter/Pages/ArticleEditorPage/ArticleEditor.vue';

const { currentParams, currentRouteName, visit } = useAppNavigation();
const store = useStore();
const { t } = useI18n();

const { articleSlug, portalSlug } = currentParams.value;

const articleById = useMapGetter('articles/articleById');

const article = computed(() => articleById.value(articleSlug));

const portalBySlug = useMapGetter('portals/portalBySlug');

const portal = computed(() => portalBySlug.value(portalSlug));

const isUpdating = ref(false);
const isSaved = ref(false);

const articleLink = computed(() => {
  const { slug: categorySlug, locale: categoryLocale } = article.value.category;
  const { slug: articleSlugValue } = article.value;
  const portalCustomDomain = portal.value?.custom_domain;
  return buildPortalArticleURL(
    portalSlug,
    categorySlug,
    categoryLocale,
    articleSlugValue,
    portalCustomDomain
  );
});

const saveArticle = async ({ ...values }, isAsync = false) => {
  const actionToDispatch = isAsync ? 'articles/updateAsync' : 'articles/update';
  isUpdating.value = true;
  try {
    await store.dispatch(actionToDispatch, {
      portalSlug,
      articleId: articleSlug,
      ...values,
    });
    isSaved.value = true;
  } catch (error) {
    const errorMessage =
      error?.message || t('HELP_CENTER.EDIT_ARTICLE_PAGE.API.ERROR');
    useAlert(errorMessage);
  } finally {
    setTimeout(() => {
      isUpdating.value = false;
      isSaved.value = true;
    }, 1500);
  }
};

const saveArticleAsync = async ({ ...values }) => {
  saveArticle({ ...values }, true);
};

const isCategoryArticles = computed(() => {
  return (
    currentRouteName.value === 'portals_categories_articles_index' ||
    currentRouteName.value === 'portals_categories_articles_edit' ||
    currentRouteName.value === 'portals_categories_index'
  );
});

const goBackToArticles = () => {
  const { tab, categorySlug, locale } = currentParams.value;
  if (isCategoryArticles.value) {
    visit({
      name: 'portals_categories_articles_index',
      params: { categorySlug, locale },
    });
  } else {
    visit({
      name: 'portals_articles_index',
      params: { tab, categorySlug, locale },
    });
  }
};

const fetchArticleDetails = () => {
  store.dispatch('articles/show', {
    id: articleSlug,
    portalSlug,
  });
};

const previewArticle = () => {
  window.open(articleLink.value, '_blank');
  useTrack(PORTALS_EVENTS.PREVIEW_ARTICLE, {
    status: article.value?.status,
  });
};

onMounted(fetchArticleDetails);
</script>

<template>
  <ArticleEditor
    :article="article"
    :is-updating="isUpdating"
    :is-saved="isSaved"
    @save-article="saveArticle"
    @save-article-async="saveArticleAsync"
    @preview-article="previewArticle"
    @go-back="goBackToArticles"
  />
</template>
