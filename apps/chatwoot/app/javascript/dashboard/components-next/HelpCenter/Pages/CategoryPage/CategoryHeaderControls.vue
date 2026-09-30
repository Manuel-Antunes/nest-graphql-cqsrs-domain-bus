<script setup>
import { computed, ref, watch } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import { OnClickOutside } from '@vueuse/components';
import { useStoreGetters } from 'dashboard/composables/store.js';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from 'dashboard/components-next/ui/breadcrumb';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import CategoryDialog from 'dashboard/components-next/HelpCenter/Pages/CategoryPage/CategoryDialog.vue';

const props = defineProps({
  categories: {
    type: Array,
    default: () => [],
  },
  allowedLocales: {
    type: Array,
    default: () => [],
  },
  hasSelectedCategory: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['localeChange', 'newArticle']);

const searchQuery = defineModel('searchQuery', {
  type: String,
  default: '',
});

const { currentParams, visit } = useAppNavigation();
const getters = useStoreGetters();
const { t } = useI18n();

const isCreateCategoryDialogOpen = ref(false);
const isEditCategoryDialogOpen = ref(false);
const isLocaleOpen = ref(false);
const localeSearch = ref('');

watch(isLocaleOpen, val => {
  if (!val) localeSearch.value = '';
});

const currentPortalSlug = computed(() => {
  return currentParams.value.portalSlug;
});

const currentPortal = computed(() => {
  const slug = currentPortalSlug.value;
  if (slug) return getters['portals/portalBySlug'].value(slug);

  return getters['portals/allPortals'].value[0];
});

const currentPortalName = computed(() => {
  return currentPortal.value?.name;
});

const activeLocale = computed(() => {
  return props.allowedLocales.find(
    locale => locale.code === currentParams.value.locale
  );
});

const activeLocaleName = computed(() => activeLocale.value?.name ?? '');
const activeLocaleCode = computed(() => activeLocale.value?.code ?? '');

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

const selectedCategory = computed(() =>
  props.categories.find(
    category => category.slug === currentParams.value.categorySlug
  )
);

const selectedCategoryName = computed(() => {
  return selectedCategory.value?.name;
});

const selectedCategoryCount = computed(
  () => selectedCategory.value?.meta?.articles_count || 0
);

const selectedCategoryEmoji = computed(() => {
  return selectedCategory.value?.icon;
});

const categoriesCount = computed(() => props.categories?.length);

const breadcrumbItems = computed(() => {
  const items = [
    {
      label: t(
        'HELP_CENTER.CATEGORY_PAGE.CATEGORY_HEADER.BREADCRUMB.CATEGORY_LOCALE',
        { localeCode: activeLocaleCode.value }
      ),
      link: '#',
    },
  ];
  if (selectedCategory.value) {
    items.push({
      label: t(
        'HELP_CENTER.CATEGORY_PAGE.CATEGORY_HEADER.BREADCRUMB.ACTIVE_CATEGORY',
        {
          categoryName: selectedCategoryName.value,
          categoryCount: selectedCategoryCount.value,
        }
      ),
      emoji: selectedCategoryEmoji.value,
      iconColor: selectedCategory.value?.icon_color,
    });
  }
  return items;
});

const handleLocaleAction = item => {
  isLocaleOpen.value = false;
  emit('localeChange', item.value);
};

const handleBreadcrumbClick = () => {
  const { categorySlug, ...otherParams } = currentParams.value;
  visit({
    name: 'portals_categories_index',
    params: otherParams,
  });
};
</script>

<template>
  <div class="flex items-center justify-between w-full">
    <div v-if="!hasSelectedCategory" class="flex items-center gap-4">
      <Popover v-model:open="isLocaleOpen">
        <PopoverTrigger as-child>
          <Button variant="outline">
            {{ activeLocaleName }}
            <Icon icon="i-lucide-chevron-down" class="ml-1" />
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
      <div class="w-px h-3.5 rounded my-auto bg-n-weak" />
      <span class="min-w-0 text-sm font-medium truncate text-n-slate-12">
        {{
          t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_HEADER.CATEGORIES_COUNT', {
            n: categoriesCount,
          })
        }}
      </span>
    </div>
    <BreadcrumbRoot v-else>
      <BreadcrumbList>
        <template v-for="(item, index) in breadcrumbItems" :key="index">
          <BreadcrumbSeparator v-if="index > 0" />
          <BreadcrumbItem>
            <BreadcrumbLink
              v-if="index !== breadcrumbItems.length - 1"
              as="button"
              type="button"
              class="cursor-pointer border-0 bg-transparent p-0"
              @click="handleBreadcrumbClick(item, index)"
            >
              {{ item.label }}
            </BreadcrumbLink>
            <BreadcrumbPage v-else class="flex items-center gap-1.5">
              <EmojiIcon
                v-if="item.emoji"
                :value="item.emoji"
                :color="item.iconColor"
                class="flex-shrink-0 size-4"
              />
              {{ item.label }}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </template>
      </BreadcrumbList>
    </BreadcrumbRoot>
    <div v-if="!hasSelectedCategory" class="flex items-center gap-2">
      <Input
        v-model="searchQuery"
        :placeholder="
          t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_HEADER.SEARCH_PLACEHOLDER')
        "
        type="search"
        size="sm"
        class="w-48"
      />
      <div class="relative">
        <OnClickOutside @trigger="isCreateCategoryDialogOpen = false">
          <Button
            variant="default"
            @click="isCreateCategoryDialogOpen = !isCreateCategoryDialogOpen"
          >
            <Icon icon="i-lucide-plus" class="mr-1" />
            {{ t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_HEADER.NEW_CATEGORY') }}
          </Button>
          <CategoryDialog
            v-if="isCreateCategoryDialogOpen"
            mode="create"
            :portal-name="currentPortalName"
            :active-locale-name="activeLocaleName"
            :active-locale-code="activeLocaleCode"
            @close="isCreateCategoryDialogOpen = false"
          />
        </OnClickOutside>
      </div>
    </div>
    <div v-else class="relative flex items-center gap-2">
      <OnClickOutside @trigger="isEditCategoryDialogOpen = false">
        <Button
          variant="outline"
          @click="isEditCategoryDialogOpen = !isEditCategoryDialogOpen"
        >
          {{ t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_HEADER.EDIT_CATEGORY') }}
        </Button>
        <CategoryDialog
          v-if="isEditCategoryDialogOpen"
          :selected-category="selectedCategory"
          :portal-name="currentPortalName"
          :active-locale-name="activeLocaleName"
          :active-locale-code="activeLocaleCode"
          @close="isEditCategoryDialogOpen = false"
        />
      </OnClickOutside>
      <Button variant="default" @click="emit('newArticle')">
        <Icon icon="i-lucide-plus" class="mr-1" />
        {{ t('HELP_CENTER.ARTICLES_PAGE.ARTICLES_HEADER.NEW_ARTICLE') }}
      </Button>
    </div>
  </div>
</template>
