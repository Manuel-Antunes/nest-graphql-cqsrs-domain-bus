<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useStore, useMapGetter } from 'dashboard/composables/store.js';
import { useConfig } from 'dashboard/composables/useConfig';
import { debounce } from '@chatwoot/utils';
import {
  ARTICLE_TABS,
  CATEGORY_ALL,
  ARTICLE_STATUSES,
} from 'dashboard/helper/portalHelper';
import { hasPendingChanges } from 'dashboard/helper/articleDiffHelper';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';
import { useAlert } from 'dashboard/composables';
import articlesAPI from 'dashboard/api/helpCenter/articles';

import HelpCenterLayout from 'dashboard/components-next/HelpCenter/HelpCenterLayout.vue';
import ArticleList from 'dashboard/components-next/HelpCenter/Pages/ArticlePage/ArticleList.vue';
import ArticleHeaderControls from 'dashboard/components-next/HelpCenter/Pages/ArticlePage/ArticleHeaderControls.vue';
import CategoryHeaderControls from 'dashboard/components-next/HelpCenter/Pages/CategoryPage/CategoryHeaderControls.vue';
import ArticleEmptyState from 'dashboard/components-next/HelpCenter/EmptyState/Article/ArticleEmptyState.vue';
import BulkSelectBar from 'dashboard/components-next/captain/assistant/BulkSelectBar.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'dashboard/components-next/ui/alert-dialog';
import BulkTranslateDialog from './BulkTranslateDialog.vue';

const props = defineProps({
  articles: {
    type: Array,
    required: true,
  },
  categories: {
    type: Array,
    required: true,
  },
  allowedLocales: {
    type: Array,
    required: true,
  },
  portalName: {
    type: String,
    required: true,
  },
  meta: {
    type: Object,
    required: true,
  },
  isCategoryArticles: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'pageChange',
  'fetchPortal',
  'refreshArticles',
  'search',
]);

const { currentParams, resolvePath, visit } = useAppNavigation();
const store = useStore();
const { t } = useI18n();

const isSwitchingPortal = useMapGetter('portals/isSwitchingPortal');
const isFetching = useMapGetter('articles/isFetching');
const currentAccountId = useMapGetter('getCurrentAccountId');
const isFeatureEnabledonAccount = useMapGetter(
  'accounts/isFeatureEnabledonAccount'
);

const selectedArticleIds = ref(new Set());
const isArticleDragging = ref(false);
const isDeleteDialogOpen = ref(false);
const isCategoryMenuOpen = ref(false);
const categorySearch = ref('');
const searchQuery = ref(
  new URLSearchParams(window.location.search).get('search') || ''
);

const debouncedSearch = debounce(() => emit('search', searchQuery.value), 500);

watch(isCategoryMenuOpen, isOpen => {
  if (!isOpen) categorySearch.value = '';
});

const { isEnterprise } = useConfig();

const isTranslationAvailable = computed(
  () =>
    isEnterprise &&
    isFeatureEnabledonAccount.value(
      currentAccountId.value,
      FEATURE_FLAGS.CAPTAIN_TASKS
    )
);

const allItems = computed(() => props.articles.map(a => ({ id: a.id })));
const visibleArticleIds = computed(() => props.articles.map(a => a.id));

const selectAllLabel = computed(() => {
  if (!visibleArticleIds.value.length) return '';
  return t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.SELECT_ALL', {
    count: visibleArticleIds.value.length,
  });
});

const selectedCountLabel = computed(() =>
  t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.SELECTED_COUNT', {
    count: selectedArticleIds.value.size,
  })
);

const bulkTranslateDialogRef = ref(null);

const hasNoArticles = computed(
  () => !isFetching.value && !props.articles.length
);

const isLoading = computed(() => isFetching.value || isSwitchingPortal.value);

const totalArticlesCount = computed(() => props.meta.allArticlesCount);

const hasNoArticlesInPortal = computed(
  () => totalArticlesCount.value === 0 && !props.isCategoryArticles
);

const shouldShowPaginationFooter = computed(() => {
  return !(isFetching.value || isSwitchingPortal.value || hasNoArticles.value);
});

const updateRoute = newParams => {
  const { portalSlug, locale, tab, categorySlug } = currentParams.value;
  const path = resolvePath({
    name: 'portals_articles_index',
    params: {
      portalSlug,
      locale: newParams.locale ?? locale,
      tab: newParams.tab ?? tab,
      categorySlug: newParams.categorySlug ?? categorySlug,
      ...newParams,
    },
  });
  visit(`${path}${window.location.search}`);
};

const articlesCount = computed(() => {
  const { tab } = currentParams.value;
  const { meta } = props;
  const countMap = {
    '': meta.articlesCount,
    mine: meta.mineArticlesCount,
    draft: meta.draftArticlesCount,
    archived: meta.archivedArticlesCount,
  };
  return Number(countMap[tab] || countMap['']);
});

const totalPages = computed(() => Math.ceil(articlesCount.value / 25) || 1);

const showArticleHeaderControls = computed(
  () => !props.isCategoryArticles && !isSwitchingPortal.value
);

const showCategoryHeaderControls = computed(
  () => props.isCategoryArticles && !isSwitchingPortal.value
);

const isSearching = computed(() => Boolean(searchQuery.value?.trim()));

const getEmptyStateText = type => {
  if (isSearching.value) {
    return t(`HELP_CENTER.ARTICLES_PAGE.EMPTY_STATE.SEARCH.${type}`);
  }
  if (props.isCategoryArticles) {
    return t(`HELP_CENTER.ARTICLES_PAGE.EMPTY_STATE.CATEGORY.${type}`);
  }
  const tabName = currentParams.value.tab?.toUpperCase() || 'ALL';
  return t(`HELP_CENTER.ARTICLES_PAGE.EMPTY_STATE.${tabName}.${type}`);
};

const getEmptyStateTitle = computed(() => getEmptyStateText('TITLE'));
const getEmptyStateSubtitle = computed(() => getEmptyStateText('SUBTITLE'));

const handleTabChange = tab =>
  updateRoute({ tab: tab.value === ARTICLE_TABS.ALL ? '' : tab.value });

const handleCategoryAction = value =>
  updateRoute({ categorySlug: value === CATEGORY_ALL ? '' : value });

const handleLocaleAction = value => {
  updateRoute({ locale: value, categorySlug: '' });
  emit('fetchPortal', value);
};
const handlePageChange = page => emit('pageChange', page);

const navigateToNewArticlePage = () => {
  const { categorySlug, locale } = currentParams.value;
  visit({
    name: props.isCategoryArticles
      ? 'portals_categories_articles_new'
      : 'portals_articles_new',
    params: { ...currentParams.value, categorySlug, locale },
  });
};

const handleToggleSelect = articleId => {
  const newSet = new Set(selectedArticleIds.value);
  if (newSet.has(articleId)) {
    newSet.delete(articleId);
  } else {
    newSet.add(articleId);
  }
  selectedArticleIds.value = newSet;
};

const clearSelection = () => {
  selectedArticleIds.value = new Set();
};

const handleTranslateArticle = articleId => {
  selectedArticleIds.value = new Set([articleId]);
  bulkTranslateDialogRef.value?.dialogRef?.open();
};

const openTranslateDialog = () => {
  bulkTranslateDialogRef.value?.dialogRef?.open();
};

const onBulkActionSuccess = message => {
  useAlert(message);
  clearSelection();
  emit('refreshArticles');
};

const bulkUpdateStatus = async status => {
  const selectedIds = [...selectedArticleIds.value];
  const { portalSlug } = currentParams.value;

  const pendingIds = props.articles
    .filter(
      article =>
        selectedIds.includes(article.id) &&
        article.status === ARTICLE_STATUSES.PUBLISHED &&
        hasPendingChanges(article)
    )
    .map(article => article.id);

  // Publish promotes each pending draft; other status changes skip them.
  const isPublishing = status === ARTICLE_STATUSES.PUBLISHED;
  const draftIds = isPublishing ? pendingIds : [];
  const skippedCount = isPublishing ? 0 : pendingIds.length;
  const articleIds = selectedIds.filter(id => !pendingIds.includes(id));

  if (!articleIds.length && !draftIds.length) {
    useAlert(t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.STATUS_SKIPPED_ALL'));
    return;
  }

  try {
    if (articleIds.length) {
      await articlesAPI.bulkUpdateStatus({ portalSlug, articleIds, status });
    }
    await Promise.all(
      draftIds.map(articleId =>
        store.dispatch('articles/publishDraft', { portalSlug, articleId })
      )
    );
    onBulkActionSuccess(
      t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.STATUS_SUCCESS')
    );
    if (skippedCount) {
      useAlert(
        t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.STATUS_SKIPPED', skippedCount)
      );
    }
  } catch (error) {
    useAlert(
      error?.message || t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.STATUS_ERROR')
    );
  }
};

const categoryMenuItems = computed(() =>
  props.categories.map(category => ({
    label: category.name,
    value: category.id,
    action: 'move',
    emoji: category.icon,
    iconColor: category.icon_color,
  }))
);

const filteredCategoryMenuItems = computed(() => {
  if (!categorySearch.value) return categoryMenuItems.value;
  const query = categorySearch.value.toLowerCase();
  return categoryMenuItems.value.filter(item =>
    item.label.toLowerCase().includes(query)
  );
});

const handleBulkUpdateCategory = async ({ value }) => {
  isCategoryMenuOpen.value = false;
  try {
    await articlesAPI.bulkUpdateCategory({
      portalSlug: currentParams.value.portalSlug,
      articleIds: [...selectedArticleIds.value],
      categoryId: value,
    });
    onBulkActionSuccess(
      t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.CATEGORY_SUCCESS')
    );
  } catch (error) {
    useAlert(
      error?.message ||
        t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.CATEGORY_ERROR')
    );
  }
};

const confirmBulkDelete = () => {
  isDeleteDialogOpen.value = true;
};

const bulkDelete = async () => {
  try {
    await articlesAPI.bulkDelete({
      portalSlug: currentParams.value.portalSlug,
      articleIds: [...selectedArticleIds.value],
    });
    isDeleteDialogOpen.value = false;
    onBulkActionSuccess(
      t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DELETE_SUCCESS')
    );
  } catch (error) {
    isDeleteDialogOpen.value = false;
    useAlert(
      error?.message || t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DELETE_ERROR')
    );
  }
};

// Clear selection when articles change (page change, filter change)
watch(
  () => props.articles,
  () => clearSelection()
);
</script>

<template>
  <HelpCenterLayout
    :current-page="Number(meta.currentPage)"
    :total-items="articlesCount"
    :items-per-page="25"
    :header="portalName"
    :breadcrumb-label="$t('HELP_CENTER.BREADCRUMB.ARTICLES')"
    :show-pagination-footer="shouldShowPaginationFooter"
    @update:current-page="handlePageChange"
  >
    <template #title-actions>
      <Input
        v-if="!isSwitchingPortal"
        v-model="searchQuery"
        :placeholder="
          t('HELP_CENTER.ARTICLES_PAGE.ARTICLES_HEADER.SEARCH_PLACEHOLDER')
        "
        type="search"
        size="sm"
        class="w-full max-w-[16rem] min-w-0"
        @input="debouncedSearch"
      />
    </template>
    <template #header-actions>
      <div class="flex items-end justify-between">
        <ArticleHeaderControls
          v-if="showArticleHeaderControls"
          :categories="categories"
          :allowed-locales="allowedLocales"
          :meta="meta"
          @tab-change="handleTabChange"
          @locale-change="handleLocaleAction"
          @category-change="handleCategoryAction"
          @new-article="navigateToNewArticlePage"
        />
        <CategoryHeaderControls
          v-else-if="showCategoryHeaderControls"
          :categories="categories"
          :allowed-locales="allowedLocales"
          :has-selected-category="isCategoryArticles"
          @new-article="navigateToNewArticlePage"
        />
      </div>
    </template>
    <template #content>
      <div
        v-if="isLoading && !isArticleDragging"
        class="flex items-center justify-center py-10 text-n-slate-11"
      >
        <Spinner class="size-6" />
      </div>
      <template v-else-if="!hasNoArticles">
        <div
          v-if="selectedArticleIds.size > 0"
          class="sticky top-0 z-[5] bg-gradient-to-b from-n-surface-1 from-90% to-transparent pt-1 pb-2"
        >
          <BulkSelectBar
            v-model="selectedArticleIds"
            :all-items="allItems"
            :select-all-label="selectAllLabel"
            :selected-count-label="selectedCountLabel"
            class="py-2 ltr:!pr-3 rtl:!pl-3 justify-between"
          >
            <template #secondaryActions>
              <Button
                variant="ghost"
                size="sm"
                class="!px-1.5"
                @click="clearSelection"
              >
                {{
                  t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.CLEAR_SELECTION')
                }}
              </Button>
            </template>
            <template #actions>
              <div class="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  class="w-fit"
                  @click="bulkUpdateStatus('published')"
                >
                  <Icon icon="i-lucide-check" />
                  <span class="hidden sm:inline">
                    {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.PUBLISH') }}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="w-fit"
                  @click="bulkUpdateStatus('draft')"
                >
                  <Icon icon="i-lucide-pencil-line" />
                  <span class="hidden sm:inline">
                    {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DRAFT') }}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="w-fit"
                  @click="bulkUpdateStatus('archived')"
                >
                  <Icon icon="i-lucide-archive-restore" />
                  <span class="hidden sm:inline">
                    {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.ARCHIVE') }}
                  </span>
                </Button>
                <Popover
                  v-if="categoryMenuItems.length"
                  v-model:open="isCategoryMenuOpen"
                >
                  <PopoverTrigger as-child>
                    <Button variant="outline" size="sm" class="w-fit">
                      <Icon icon="i-lucide-folder-input" />
                      <span class="hidden sm:inline">
                        {{
                          t(
                            'HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.MOVE_TO_CATEGORY'
                          )
                        }}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="p-0 w-48" align="end">
                    <div class="px-3 py-2 border-b border-n-weak">
                      <input
                        v-model="categorySearch"
                        type="search"
                        :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
                        class="w-full text-sm bg-transparent outline-none text-n-slate-12 placeholder:text-n-slate-9"
                      />
                    </div>
                    <div class="flex flex-col p-1 overflow-y-auto max-h-60">
                      <Button
                        v-for="item in filteredCategoryMenuItems"
                        :key="item.value"
                        variant="ghost"
                        class="justify-start"
                        @click="handleBulkUpdateCategory(item)"
                      >
                        <EmojiIcon
                          v-if="item.emoji"
                          :value="item.emoji"
                          :color="item.iconColor"
                          class="flex-shrink-0 size-4"
                        />
                        <span class="truncate">{{ item.label }}</span>
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  v-if="isTranslationAvailable"
                  variant="outline"
                  size="sm"
                  class="w-fit"
                  @click="openTranslateDialog"
                >
                  <Icon icon="i-lucide-languages" />
                  <span class="hidden sm:inline">
                    {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.TRANSLATE') }}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive hover:text-destructive"
                  :title="t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DELETE')"
                  @click="confirmBulkDelete"
                >
                  <Icon icon="i-lucide-trash" />
                </Button>
              </div>
            </template>
          </BulkSelectBar>
        </div>
        <ArticleList
          :articles="articles"
          :is-category-articles="isCategoryArticles"
          :is-searching="isSearching"
          :selected-article-ids="selectedArticleIds"
          :current-page="Number(meta.currentPage)"
          :total-pages="totalPages"
          class="relative z-0"
          @translate-article="handleTranslateArticle"
          @toggle-select="handleToggleSelect"
          @navigate-page="handlePageChange"
          @dragging="isArticleDragging = $event"
        />
      </template>
      <ArticleEmptyState
        v-else
        class="pt-14"
        :title="getEmptyStateTitle"
        :subtitle="getEmptyStateSubtitle"
        :show-button="hasNoArticlesInPortal && !isSearching"
        :button-label="
          t('HELP_CENTER.ARTICLES_PAGE.EMPTY_STATE.ALL.BUTTON_LABEL')
        "
        @click="navigateToNewArticlePage"
      />
    </template>
    <BulkTranslateDialog
      ref="bulkTranslateDialogRef"
      :selected-article-ids="[...selectedArticleIds]"
      :allowed-locales="allowedLocales"
      @translate-started="clearSelection"
    />
    <AlertDialog v-model:open="isDeleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{
              t(
                'HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DELETE_CONFIRM_TITLE',
                selectedArticleIds.size
              )
            }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{
              t(
                'HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DELETE_CONFIRM_DESCRIPTION',
                selectedArticleIds.size
              )
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel as-child>
            <Button variant="outline">
              {{ t('DIALOG.BUTTONS.CANCEL') }}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="bulkDelete">
            {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_ACTIONS.DELETE_CONFIRM') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </HelpCenterLayout>
</template>
