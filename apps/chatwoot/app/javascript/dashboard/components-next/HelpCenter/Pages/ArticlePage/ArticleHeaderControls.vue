<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useUISettings } from 'dashboard/composables/useUISettings';
import {
  ARTICLE_TABS,
  CATEGORY_ALL,
  ARTICLE_TABS_OPTIONS,
} from 'dashboard/helper/portalHelper';

import TabBar from 'dashboard/components-next/tabbar/TabBar.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  categories: {
    type: Array,
    required: true,
  },
  allowedLocales: {
    type: Array,
    required: true,
  },
  meta: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits([
  'tabChange',
  'localeChange',
  'categoryChange',
  'newArticle',
]);

const { currentParams } = useAppNavigation();
const { t } = useI18n();
const { updateUISettings } = useUISettings();

const isLocaleOpen = ref(false);
const isCategoryOpen = ref(false);
const localeSearch = ref('');
const categorySearch = ref('');

watch(isLocaleOpen, val => {
  if (!val) localeSearch.value = '';
});
watch(isCategoryOpen, val => {
  if (!val) categorySearch.value = '';
});

const countKey = tab => {
  if (tab.value === 'all') {
    return 'articlesCount';
  }
  return `${tab.value}ArticlesCount`;
};

const tabs = computed(() => {
  return ARTICLE_TABS_OPTIONS.map(tab => ({
    label: t(`HELP_CENTER.ARTICLES_PAGE.ARTICLES_HEADER.TABS.${tab.key}`),
    value: tab.value,
    count: props.meta[countKey(tab)],
  }));
});

const activeTabIndex = computed(() => {
  const tabParam = currentParams.value.tab || ARTICLE_TABS.ALL;
  return tabs.value.findIndex(tab => tab.value === tabParam);
});

const activeCategory = computed(() =>
  props.categories.find(
    category => category.slug === currentParams.value.categorySlug
  )
);

const activeCategoryName = computed(
  () =>
    activeCategory.value?.name ||
    t('HELP_CENTER.ARTICLES_PAGE.ARTICLES_HEADER.CATEGORY.ALL')
);

const activeLocaleName = computed(() => {
  return props.allowedLocales.find(
    locale => locale.code === currentParams.value.locale
  )?.name;
});

const categoryMenuItems = computed(() => {
  const defaultMenuItem = {
    label: t('HELP_CENTER.ARTICLES_PAGE.ARTICLES_HEADER.CATEGORY.ALL'),
    value: CATEGORY_ALL,
    action: 'filter',
  };

  const categoryItems = props.categories.map(category => ({
    label: category.name,
    value: category.slug,
    action: 'filter',
    emoji: category.icon,
    iconColor: category.icon_color,
  }));

  const hasCategorySlug = !!currentParams.value.categorySlug;

  return hasCategorySlug ? [defaultMenuItem, ...categoryItems] : categoryItems;
});

const hasCategoryMenuItems = computed(() => {
  return categoryMenuItems.value?.length > 0;
});

const localeMenuItems = computed(() => {
  return props.allowedLocales.map(locale => ({
    label: locale.name,
    value: locale.code,
    action: 'filter',
  }));
});

const filteredLocaleItems = computed(() => {
  if (!localeSearch.value) return localeMenuItems.value;
  const q = localeSearch.value.toLowerCase();
  return localeMenuItems.value.filter(item =>
    item.label.toLowerCase().includes(q)
  );
});

const filteredCategoryItems = computed(() => {
  if (!categorySearch.value) return categoryMenuItems.value;
  const q = categorySearch.value.toLowerCase();
  return categoryMenuItems.value.filter(item =>
    item.label.toLowerCase().includes(q)
  );
});

const handleLocaleAction = item => {
  isLocaleOpen.value = false;
  emit('localeChange', item.value);
  updateUISettings({ last_active_locale_code: item.value });
};

const handleCategoryAction = item => {
  isCategoryOpen.value = false;
  emit('categoryChange', item.value);
};

const handleNewArticle = () => {
  emit('newArticle');
};

const handleTabChange = value => {
  emit('tabChange', value);
};
</script>

<template>
  <div class="flex flex-col items-start w-full gap-2 lg:flex-row">
    <TabBar
      :tabs="tabs"
      :initial-active-tab="activeTabIndex"
      @tab-changed="handleTabChange"
    />
    <div class="flex items-start justify-between w-full gap-2">
      <div class="flex items-center gap-2">
        <Popover v-model:open="isLocaleOpen">
          <PopoverTrigger as-child>
            <Button variant="outline">
              {{ activeLocaleName }}
              <Icon icon="i-lucide-chevron-down" class="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="p-0 w-48" align="start">
            <div class="px-3 py-2 border-b border-n-weak">
              <input
                v-model="localeSearch"
                type="search"
                :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
                class="w-full text-sm bg-transparent outline-none text-n-slate-12 placeholder:text-n-slate-9"
              />
            </div>
            <div class="flex flex-col max-h-60 overflow-y-auto p-1">
              <Button
                v-for="item in filteredLocaleItems"
                :key="item.value"
                variant="ghost"
                class="justify-start"
                @click="handleLocaleAction(item)"
              >
                {{ item.label }}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Popover v-if="hasCategoryMenuItems" v-model:open="isCategoryOpen">
          <PopoverTrigger as-child>
            <Button variant="outline" class="max-w-48">
              <span class="flex items-center gap-1.5 min-w-0">
                <EmojiIcon
                  v-if="activeCategory?.icon"
                  :value="activeCategory.icon"
                  :color="activeCategory.icon_color"
                  class="flex-shrink-0 size-4"
                />
                <span class="truncate">{{ activeCategoryName }}</span>
              </span>
              <Icon icon="i-lucide-chevron-down" class="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="p-0 w-56" align="start">
            <div class="px-3 py-2 border-b border-n-weak">
              <input
                v-model="categorySearch"
                type="search"
                :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
                class="w-full text-sm bg-transparent outline-none text-n-slate-12 placeholder:text-n-slate-9"
              />
            </div>
            <div class="flex flex-col max-h-60 overflow-y-auto p-1">
              <Button
                v-for="item in filteredCategoryItems"
                :key="item.value"
                variant="ghost"
                class="justify-start"
                @click="handleCategoryAction(item)"
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
      </div>
      <Button variant="default" @click="handleNewArticle">
        <Icon icon="i-lucide-plus" class="size-4" />
        {{ t('HELP_CENTER.ARTICLES_PAGE.ARTICLES_HEADER.NEW_ARTICLE') }}
      </Button>
    </div>
  </div>
</template>
