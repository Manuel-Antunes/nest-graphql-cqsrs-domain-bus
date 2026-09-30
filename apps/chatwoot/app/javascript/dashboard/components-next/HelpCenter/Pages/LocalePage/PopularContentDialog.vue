<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useAbortableRequest } from 'dashboard/composables/useAbortableRequest';
import categoriesAPI from 'dashboard/api/helpCenter/categories';
import articlesAPI from 'dashboard/api/helpCenter/articles';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import ReorderableMultiSelect from 'dashboard/components-next/combobox/ReorderableMultiSelect.vue';

const props = defineProps({
  portal: {
    type: Object,
    default: () => ({}),
  },
});

const MAX_CATEGORIES = 3;
const MAX_ARTICLES = 6;
const KEY = 'HELP_CENTER.LOCALES_PAGE.POPULAR_CONTENT_DIALOG';

const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);
const isSubmitting = ref(false);
const activeLocale = ref('');
// One flag per picker so each shows its skeleton until its own data loads.
const categoriesLoading = ref(false);
const { run: runArticleRequest, isPending: articlesLoading } =
  useAbortableRequest();

const categoryOptions = ref([]);
const selectedCategoryIds = ref([]);

// Articles are searched server-side, so cache options for selected items that
// fall outside the current results.
const articleResults = ref([]);
const articleOptionById = ref({});
const selectedArticleIds = ref([]);

const popularContent = computed(
  () => props.portal?.config?.popular_content || {}
);

const articleOptions = computed(() => {
  const options = new Map();
  selectedArticleIds.value.forEach(id => {
    if (articleOptionById.value[id])
      options.set(id, articleOptionById.value[id]);
  });
  articleResults.value.forEach(option => options.set(option.value, option));
  return [...options.values()];
});

const toArticleOption = article => ({
  value: article.id,
  label: article.title,
  subtitle: t(`${KEY}.ARTICLES.IN_CATEGORY`, {
    category: article.category?.name || t(`${KEY}.ARTICLES.UNCATEGORIZED`),
  }),
});

const fetchCategories = async localeCode => {
  const {
    data: { payload },
  } = await categoriesAPI.get({
    portalSlug: props.portal?.slug,
    locale: localeCode,
  });
  return payload.map(category => ({
    value: category.id,
    label: category.name,
    subtitle: t(`${KEY}.CATEGORIES.ARTICLES_COUNT`, {
      count: category.meta?.articles_count || 0,
    }),
    icon: category.icon,
    iconColor: category.icon_color,
  }));
};

const requestArticles = async (query, signal) => {
  const { data } = await articlesAPI.getArticles({
    pageNumber: 1,
    portalSlug: props.portal?.slug,
    locale: activeLocale.value,
    status: 'published',
    query,
    signal,
  });
  articleResults.value = data.payload.map(article => {
    const option = toArticleOption(article);
    articleOptionById.value[article.id] = option;
    return option;
  });
};

const searchArticles = (query = '') =>
  runArticleRequest(signal => requestArticles(query, signal));

const onArticleSearch = useDebounceFn(searchArticles, 300);

// Resolve options for pre-selected articles that aren't in the current results.
const cacheSelectedArticleOptions = async () => {
  const unknownIds = selectedArticleIds.value.filter(
    id => !articleOptionById.value[id]
  );
  await Promise.all(
    unknownIds.map(async id => {
      try {
        const { data } = await articlesAPI.getArticle({
          id,
          portalSlug: props.portal?.slug,
        });
        articleOptionById.value[id] = toArticleOption(data.payload);
      } catch {
        // Deleted since it was picked; leave it for the id fallback.
      }
    })
  );
};

const loadCategories = async localeCode => {
  categoriesLoading.value = true;
  try {
    const options = await fetchCategories(localeCode);
    // Reopened for another locale mid-flight; drop the stale response.
    if (localeCode !== activeLocale.value) return;
    categoryOptions.value = options;
  } catch (error) {
    useAlert(error?.message || t(`${KEY}.API.ERROR_MESSAGE`));
  } finally {
    if (localeCode === activeLocale.value) categoriesLoading.value = false;
  }
};

const loadArticles = async () => {
  try {
    await runArticleRequest(signal =>
      Promise.all([cacheSelectedArticleOptions(), requestArticles('', signal)])
    );
  } catch (error) {
    useAlert(error?.message || t(`${KEY}.API.ERROR_MESSAGE`));
  }
};

const openForLocale = localeCode => {
  const existing = popularContent.value[localeCode] || {};
  activeLocale.value = localeCode;
  selectedCategoryIds.value = [...(existing.category_ids || [])];
  selectedArticleIds.value = [...(existing.article_ids || [])];
  categoryOptions.value = [];
  articleResults.value = [];
  articleOptionById.value = {};
  isOpen.value = true;

  loadCategories(localeCode);
  loadArticles();
};

const onConfirm = async () => {
  const updated = { ...popularContent.value };
  const entry = {
    category_ids: selectedCategoryIds.value,
    article_ids: selectedArticleIds.value,
  };

  if (entry.category_ids.length || entry.article_ids.length) {
    updated[activeLocale.value] = entry;
  } else {
    delete updated[activeLocale.value];
  }

  isSubmitting.value = true;
  try {
    await store.dispatch('portals/update', {
      portalSlug: props.portal?.slug,
      config: { popular_content: updated },
    });
    isOpen.value = false;
    useAlert(t(`${KEY}.API.SUCCESS_MESSAGE`));
  } catch (error) {
    useAlert(error?.message || t(`${KEY}.API.ERROR_MESSAGE`));
  } finally {
    isSubmitting.value = false;
  }
};

defineExpose({ openForLocale });
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t(`${KEY}.TITLE`) }}</DialogTitle>
        <DialogDescription>{{ t(`${KEY}.DESCRIPTION`) }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-5">
        <ReorderableMultiSelect
          v-model="selectedCategoryIds"
          :options="categoryOptions"
          :max="MAX_CATEGORIES"
          :label="t(`${KEY}.CATEGORIES.LABEL`)"
          :add-label="t(`${KEY}.ADD_ANOTHER`)"
          :search-placeholder="t(`${KEY}.SEARCH`)"
          :empty-state="t(`${KEY}.EMPTY`)"
          fallback-icon="i-lucide-folder"
          :loading="categoriesLoading"
        >
          <template #counter="{ remaining }">
            {{ t(`${KEY}.SLOTS_LEFT`, { count: remaining }) }}
          </template>
          <template #note>{{ t(`${KEY}.OVERRIDING_DEFAULTS`) }}</template>
        </ReorderableMultiSelect>
        <ReorderableMultiSelect
          v-model="selectedArticleIds"
          server-search
          :options="articleOptions"
          :max="MAX_ARTICLES"
          :label="t(`${KEY}.ARTICLES.LABEL`)"
          :add-label="t(`${KEY}.ADD_ANOTHER`)"
          :search-placeholder="t(`${KEY}.SEARCH`)"
          :empty-state="t(`${KEY}.EMPTY`)"
          :loading="articlesLoading"
          @search="onArticleSearch"
        >
          <template #counter="{ remaining }">
            {{ t(`${KEY}.SLOTS_LEFT`, { count: remaining }) }}
          </template>
          <template #note>{{ t(`${KEY}.OVERRIDING_DEFAULTS`) }}</template>
        </ReorderableMultiSelect>
      </div>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          class="w-full"
          :disabled="isSubmitting"
          @click="onConfirm"
        >
          <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
          {{ t(`${KEY}.CONFIRM`) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
