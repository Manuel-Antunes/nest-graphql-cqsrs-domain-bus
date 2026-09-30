<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useStore } from 'dashboard/composables/store.js';
import { useAlert, useTrack } from 'dashboard/composables';
import { PORTALS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { getArticleStatus } from 'dashboard/helper/portalHelper.js';
import {
  ARTICLE_EDITOR_STATUS_OPTIONS,
  ARTICLE_STATUSES,
  ARTICLE_MENU_ITEMS,
} from 'dashboard/helper/portalHelper';
import wootConstants from 'dashboard/constants/globals';

import ButtonGroup from 'dashboard/components-next/buttonGroup/ButtonGroup.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  isUpdating: {
    type: Boolean,
    default: false,
  },
  isSaved: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    default: '',
  },
  articleId: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['goBack', 'previewArticle']);

const { t } = useI18n();
const store = useStore();
const { currentParams } = useAppNavigation();

const isArticlePublishing = ref(false);
const isOpen = ref(false);

const { ARTICLE_STATUS_TYPES } = wootConstants;

const articleMenuItems = computed(() => {
  const statusOptions = ARTICLE_EDITOR_STATUS_OPTIONS[props.status] ?? [];
  return statusOptions.map(option => {
    const { label, value, icon } = ARTICLE_MENU_ITEMS[option];
    return {
      label: t(label),
      value,
      action: 'update-status',
      icon,
    };
  });
});

const statusText = computed(() =>
  t(
    `HELP_CENTER.EDIT_ARTICLE_PAGE.HEADER.STATUS.${props.isUpdating ? 'SAVING' : 'SAVED'}`
  )
);

const onClickGoBack = () => emit('goBack');

const previewArticle = () => emit('previewArticle');

const getStatusMessage = (status, isSuccess) => {
  const messageType = isSuccess ? 'SUCCESS' : 'ERROR';
  const statusMap = {
    [ARTICLE_STATUS_TYPES.PUBLISH]: 'PUBLISH_ARTICLE',
    [ARTICLE_STATUS_TYPES.ARCHIVE]: 'ARCHIVE_ARTICLE',
    [ARTICLE_STATUS_TYPES.DRAFT]: 'DRAFT_ARTICLE',
  };

  return statusMap[status]
    ? t(`HELP_CENTER.${statusMap[status]}.API.${messageType}`)
    : '';
};

const updateArticleStatus = async ({ value }) => {
  isOpen.value = false;
  const status = getArticleStatus(value);
  if (status === ARTICLE_STATUS_TYPES.PUBLISH) {
    isArticlePublishing.value = true;
  }
  const { portalSlug } = currentParams.value;

  try {
    await store.dispatch('articles/update', {
      portalSlug,
      articleId: props.articleId,
      status,
    });

    useAlert(getStatusMessage(status, true));

    if (status === ARTICLE_STATUS_TYPES.ARCHIVE) {
      useTrack(PORTALS_EVENTS.ARCHIVE_ARTICLE, { uiFrom: 'header' });
    } else if (status === ARTICLE_STATUS_TYPES.PUBLISH) {
      useTrack(PORTALS_EVENTS.PUBLISH_ARTICLE);
    }
    isArticlePublishing.value = false;
  } catch (error) {
    useAlert(error?.message ?? getStatusMessage(status, false));
    isArticlePublishing.value = false;
  }
};
</script>

<template>
  <div class="flex items-center justify-between h-20">
    <Button variant="link" @click="onClickGoBack">
      <Icon icon="i-lucide-chevron-left" />
      {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.HEADER.BACK_TO_ARTICLES') }}
    </Button>
    <div class="flex items-center gap-4">
      <span
        v-if="isUpdating || isSaved"
        class="text-xs font-medium transition-all duration-300 text-n-slate-11"
      >
        {{ statusText }}
      </span>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          :disabled="!articleId"
          @click="previewArticle"
        >
          {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.HEADER.PREVIEW') }}
        </Button>
        <ButtonGroup class="flex items-center">
          <Button
            variant="default"
            class="ltr:rounded-r-none rtl:rounded-l-none"
            :disabled="
              status === ARTICLE_STATUSES.PUBLISHED ||
              !articleId ||
              isArticlePublishing
            "
            @click="updateArticleStatus({ value: ARTICLE_STATUSES.PUBLISHED })"
          >
            <Spinner v-if="isArticlePublishing" class="size-4 flex-shrink-0" />
            <template v-if="!isArticlePublishing">
              {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.HEADER.PUBLISH') }}
            </template>
          </Button>
          <Popover v-model:open="isOpen">
            <PopoverTrigger as-child>
              <Button
                variant="default"
                size="icon"
                class="ltr:rounded-l-none rtl:rounded-r-none"
                :disabled="!articleId"
              >
                <Icon icon="i-lucide-chevron-down" class="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              class="flex flex-col p-1 w-auto min-w-36"
            >
              <Button
                v-for="item in articleMenuItems"
                :key="item.value"
                variant="ghost"
                class="justify-start"
                :class="
                  item.action === 'delete'
                    ? 'text-destructive hover:text-destructive'
                    : ''
                "
                :disabled="item.disabled"
                @click="updateArticleStatus(item)"
              >
                <Icon
                  v-if="item.icon"
                  :icon="item.icon"
                  class="size-3.5 flex-shrink-0"
                />
                <span v-if="item.emoji" class="flex-shrink-0">{{
                  item.emoji
                }}</span>
                {{ item.label }}
              </Button>
            </PopoverContent>
          </Popover>
        </ButtonGroup>
      </div>
    </div>
  </div>
</template>
