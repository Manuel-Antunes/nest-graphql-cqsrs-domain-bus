<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { OnClickOutside } from '@vueuse/components';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter } from 'dashboard/composables/store';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import ArticleEditorProperties from 'dashboard/components-next/HelpCenter/Pages/ArticleEditorPage/ArticleEditorProperties.vue';

const props = defineProps({
  article: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['saveArticle', 'setAuthor', 'setCategory']);

const { t } = useI18n();
const { currentParams } = useAppNavigation();

const openProperties = ref(false);
const selectedAuthorId = ref(null);
const selectedCategoryId = ref(null);
const isAuthorOpen = ref(false);
const isCategoryOpen = ref(false);
const authorSearch = ref('');
const categorySearch = ref('');

watch(isAuthorOpen, val => {
  if (!val) authorSearch.value = '';
});
watch(isCategoryOpen, val => {
  if (!val) categorySearch.value = '';
});

const agents = useMapGetter('agents/getAgents');
const categories = useMapGetter('categories/allCategories');
const currentUserId = useMapGetter('getCurrentUserID');

const isNewArticle = computed(() => !props.article?.id);

const currentUser = computed(() =>
  agents.value.find(agent => agent.id === currentUserId.value)
);

const categorySlugFromRoute = computed(() => currentParams.value.categorySlug);

const author = computed(() => {
  if (isNewArticle.value) {
    return selectedAuthorId.value
      ? agents.value.find(agent => agent.id === selectedAuthorId.value)
      : currentUser.value;
  }
  return props.article?.author || null;
});

const authorName = computed(
  () => author.value?.name || author.value?.available_name || ''
);
const authorThumbnailSrc = computed(() => author.value?.thumbnail);

const agentList = computed(() => {
  return (
    agents.value
      ?.map(({ name, id, thumbnail }) => ({
        label: name,
        value: id,
        thumbnail: { name, src: thumbnail },
        isSelected: props.article?.author?.id
          ? id === props.article.author.id
          : id === (selectedAuthorId.value || currentUserId.value),
        action: 'assignAuthor',
      }))
      .toSorted((a, b) => {
        if (a.isSelected !== b.isSelected) {
          return Number(b.isSelected) - Number(a.isSelected);
        }
        return a.label.localeCompare(b.label);
      }) ?? []
  );
});

const hasAgentList = computed(() => {
  return agents.value?.length > 1;
});

const findCategoryFromSlug = slug => {
  return categories.value?.find(category => category.slug === slug);
};

const selectedCategory = computed(() => {
  if (isNewArticle.value) {
    if (selectedCategoryId.value) {
      return (
        categories.value?.find(c => c.id === selectedCategoryId.value) || null
      );
    }
    if (categorySlugFromRoute.value) {
      const categoryFromSlug = findCategoryFromSlug(
        categorySlugFromRoute.value
      );
      if (categoryFromSlug) return categoryFromSlug;
    }
    return categories.value?.[0] || null;
  }
  return categories.value.find(
    category => category.id === props.article?.category?.id
  );
});

const categoryList = computed(() => {
  return categories.value
    .map(({ name, id, icon, icon_color: iconColor }) => ({
      label: name,
      value: id,
      emoji: icon,
      iconColor,
      isSelected: isNewArticle.value
        ? id === (selectedCategoryId.value || selectedCategory.value?.id)
        : id === props.article?.category?.id,
      action: 'assignCategory',
    }))
    .toSorted((a, b) => Number(b.isSelected) - Number(a.isSelected));
});

const hasCategoryMenuItems = computed(() => {
  return categoryList.value?.length > 0;
});

const filteredAgentList = computed(() => {
  if (!authorSearch.value) return agentList.value;
  const q = authorSearch.value.toLowerCase();
  return agentList.value.filter(item => item.label.toLowerCase().includes(q));
});

const filteredCategoryList = computed(() => {
  if (!categorySearch.value) return categoryList.value;
  const q = categorySearch.value.toLowerCase();
  return categoryList.value.filter(item =>
    item.label.toLowerCase().includes(q)
  );
});

const handleArticleAction = ({ action, value }) => {
  const actions = {
    assignAuthor: () => {
      if (isNewArticle.value) {
        selectedAuthorId.value = value;
        emit('setAuthor', value);
      } else {
        emit('saveArticle', { author_id: value });
      }
    },
    assignCategory: () => {
      if (isNewArticle.value) {
        selectedCategoryId.value = value;
        emit('setCategory', value);
      } else {
        emit('saveArticle', { category_id: value });
      }
    },
  };

  actions[action]?.();
};

const selectAuthor = item => {
  isAuthorOpen.value = false;
  handleArticleAction(item);
};

const selectCategory = item => {
  isCategoryOpen.value = false;
  handleArticleAction(item);
};

const updateMeta = meta => {
  emit('saveArticle', { meta });
};

onMounted(() => {
  if (categorySlugFromRoute.value && isNewArticle.value) {
    const categoryFromSlug = findCategoryFromSlug(categorySlugFromRoute.value);
    if (categoryFromSlug) {
      handleArticleAction({
        action: 'assignCategory',
        value: categoryFromSlug?.id,
      });
    }
  }
});
</script>

<template>
  <div class="flex items-center gap-4">
    <Popover v-if="hasAgentList" v-model:open="isAuthorOpen">
      <PopoverTrigger as-child>
        <Button variant="none" size="none" class="hover:opacity-80">
          <Avatar
            :name="authorName"
            :src="authorThumbnailSrc"
            :size="20"
            rounded-full
          />
          <span class="text-sm text-n-slate-12 hover:text-n-slate-11">
            {{ authorName || '-' }}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="p-0 w-56" align="start">
        <div class="px-3 py-2 border-b border-n-weak">
          <input
            v-model="authorSearch"
            type="search"
            :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
            class="w-full text-sm bg-transparent outline-none text-n-slate-12 placeholder:text-n-slate-9"
          />
        </div>
        <div class="flex flex-col max-h-60 overflow-y-auto p-1">
          <Button
            v-for="item in filteredAgentList"
            :key="item.value"
            variant="ghost"
            class="justify-start"
            :class="
              item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''
            "
            @click="selectAuthor(item)"
          >
            <Avatar
              :name="item.thumbnail.name"
              :src="item.thumbnail.src"
              :size="16"
              rounded-full
            />
            {{ item.label }}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    <div class="w-px h-3 bg-n-weak" />
    <Popover v-if="hasCategoryMenuItems" v-model:open="isCategoryOpen">
      <PopoverTrigger as-child>
        <Button variant="none" size="none" class="px-2 hover:opacity-80">
          <Icon
            v-if="!selectedCategory?.icon"
            icon="i-lucide-shapes"
            class="size-4"
          />
          <span
            class="flex items-center gap-1.5 min-w-0 text-sm text-n-slate-12 hover:text-n-slate-11"
          >
            <EmojiIcon
              v-if="selectedCategory?.icon"
              :value="selectedCategory.icon"
              :color="selectedCategory.icon_color"
              class="flex-shrink-0 size-4"
            />
            <span class="truncate">
              {{
                selectedCategory?.name ||
                t('HELP_CENTER.EDIT_ARTICLE_PAGE.EDIT_ARTICLE.UNCATEGORIZED')
              }}
            </span>
          </span>
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
            v-for="item in filteredCategoryList"
            :key="item.value"
            variant="ghost"
            class="justify-start"
            :class="
              item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''
            "
            @click="selectCategory(item)"
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

    <div class="w-px h-3 bg-n-weak" />
    <div class="relative">
      <OnClickOutside @trigger="openProperties = false">
        <Button
          variant="ghost"
          :disabled="isNewArticle"
          class="!px-2 font-normal hover:!bg-transparent hover:!text-n-slate-11"
          @click="openProperties = !openProperties"
        >
          <Icon icon="i-lucide-plus" class="size-4" />
          {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.EDIT_ARTICLE.MORE_PROPERTIES') }}
        </Button>
        <ArticleEditorProperties
          v-if="openProperties"
          :article="article"
          class="right-0 z-[100] mt-2 xl:left-0 top-full"
          @save-article="updateMeta"
          @close="openProperties = false"
        />
      </OnClickOutside>
    </div>
  </div>
</template>
