<script setup>
import { ref, computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import { useAlert, useTrack } from 'dashboard/composables';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { PORTALS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';

import ArticleEditor from 'dashboard/components-next/HelpCenter/Pages/ArticleEditorPage/ArticleEditor.vue';

const { currentParams, currentRouteName, visit } = useAppNavigation();
const store = useStore();
const { t } = useI18n();

const { portalSlug } = currentParams.value;

const selectedAuthorId = ref(null);
const selectedCategoryId = ref(null);

const currentUserId = useMapGetter('getCurrentUserID');
const categories = useMapGetter('categories/allCategories');

const categoryId = computed(() => {
  const { categorySlug } = currentParams.value;
  if (categorySlug) {
    const matched = categories.value?.find(c => c.slug === categorySlug);
    if (matched) return matched.id;
  }
  return categories.value[0]?.id || null;
});

const isCategoryArticles = computed(
  () => currentRouteName.value === 'portals_categories_articles_new'
);

const article = ref({});
const isUpdating = ref(false);
const isSaved = ref(false);

const setAuthorId = authorId => {
  selectedAuthorId.value = authorId;
};

const setCategoryId = newCategoryId => {
  selectedCategoryId.value = newCategoryId;
};

const createNewArticle = async ({ title, content }) => {
  if (title) article.value.title = title;
  if (content) article.value.content = content;

  if (!article.value.title || isUpdating.value) return;

  isUpdating.value = true;
  try {
    const { locale } = currentParams.value;
    const resolvedCategoryId = selectedCategoryId.value || categoryId.value;
    const articleId = await store.dispatch('articles/create', {
      portalSlug,
      content: article.value.content,
      title: article.value.title,
      locale: locale,
      authorId: selectedAuthorId.value || currentUserId.value,
      categoryId: resolvedCategoryId,
    });

    useTrack(PORTALS_EVENTS.CREATE_ARTICLE, { locale });

    const resolvedSlug = categories.value?.find(
      c => c.id === resolvedCategoryId
    )?.slug;
    const startedFromCategorySlug = currentParams.value.categorySlug;

    visit({
      name: isCategoryArticles.value
        ? 'portals_categories_articles_edit'
        : 'portals_articles_edit',
      params: {
        articleSlug: articleId,
        portalSlug,
        locale,
        ...(startedFromCategorySlug
          ? { categorySlug: resolvedSlug || startedFromCategorySlug }
          : {}),
      },
    });
  } catch (error) {
    const errorMessage =
      error?.message || t('HELP_CENTER.EDIT_ARTICLE_PAGE.API.ERROR');
    useAlert(errorMessage);
  } finally {
    isUpdating.value = false;
  }
};

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
</script>

<template>
  <ArticleEditor
    :article="article"
    :is-updating="isUpdating"
    :is-saved="isSaved"
    @create-article="createNewArticle"
    @go-back="goBackToArticles"
    @set-author="setAuthorId"
    @set-category="setCategoryId"
  />
</template>
