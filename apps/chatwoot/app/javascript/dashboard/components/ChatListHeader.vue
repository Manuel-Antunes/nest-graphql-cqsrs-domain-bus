<script setup>
import { computed } from 'vue';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { formatNumber } from '@chatwoot/utils';
import wootConstants from 'dashboard/constants/globals';

import ConversationBasicFilter from './widgets/conversation/ConversationBasicFilter.vue';
import SwitchLayout from 'dashboard/routes/dashboard/conversation/search/SwitchLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
import Badge from 'next/ui/badge/Badge.vue';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';

const props = defineProps({
  pageTitle: { type: String, required: true },
  hasAppliedFilters: { type: Boolean, required: true },
  hasActiveFolders: { type: Boolean, required: true },
  activeStatus: { type: String, required: true },
  isOnExpandedLayout: { type: Boolean, required: true },
  conversationStats: { type: Object, required: true },
  isListLoading: { type: Boolean, required: true },
});

const emit = defineEmits([
  'addFolders',
  'deleteFolders',
  'resetFilters',
  'basicFilterChange',
  'filtersModal',
]);

const { uiSettings, updateUISettings } = useUISettings();

const onBasicFilterChange = (value, type) => {
  emit('basicFilterChange', value, type);
};

const hasAppliedFiltersOrActiveFolders = computed(() => {
  return props.hasAppliedFilters || props.hasActiveFolders;
});

const allCount = computed(() => props.conversationStats?.allCount || 0);
const formattedAllCount = computed(() => formatNumber(allCount.value));

const toggleConversationLayout = () => {
  const { LAYOUT_TYPES } = wootConstants;
  const {
    conversation_display_type: conversationDisplayType = LAYOUT_TYPES.CONDENSED,
  } = uiSettings.value;
  const newViewType =
    conversationDisplayType === LAYOUT_TYPES.CONDENSED
      ? LAYOUT_TYPES.EXPANDED
      : LAYOUT_TYPES.CONDENSED;
  updateUISettings({
    conversation_display_type: newViewType,
    previously_used_conversation_display_type: newViewType,
  });
};
</script>

<template>
  <div
    class="flex flex-col"
    :class="{
      'border-b border-n-strong': hasAppliedFiltersOrActiveFolders,
    }"
  >
    <!-- Title row -->
    <div class="flex items-center justify-between gap-2 px-3 h-12">
      <div class="flex items-center justify-center min-w-0 gap-2">
        <h1
          class="text-base font-medium truncate text-n-slate-12"
          :title="pageTitle"
        >
          {{ pageTitle }}
        </h1>
        <span
          v-if="
            allCount > 0 && hasAppliedFiltersOrActiveFolders && !isListLoading
          "
          class="px-2 py-1 my-0.5 mx-1 rounded-md capitalize bg-n-slate-3 text-xxs text-n-slate-12 shrink-0"
          :title="allCount"
        >
          {{ formattedAllCount }}
        </span>
        <Badge v-if="!hasAppliedFiltersOrActiveFolders" variant="outline">
          {{ $t(`CHAT_LIST.CHAT_STATUS_FILTER_ITEMS.${activeStatus}.TEXT`) }}
        </Badge>
      </div>
      <div class="flex items-center gap-1">
        <template v-if="hasAppliedFilters && !hasActiveFolders">
          <div class="relative">
            <Button
              v-tooltip.top-end="$t('FILTER.CUSTOM_VIEWS.ADD.SAVE_BUTTON')"
              size="icon"
              @click="emit('addFolders')"
            >
              <Icon icon="i-lucide-save" />
            </Button>
            <div
              id="saveFilterTeleportTarget"
              class="absolute z-50 mt-2"
              :class="{ 'ltr:right-0 rtl:left-0': isOnExpandedLayout }"
            />
          </div>
          <Button
            v-tooltip.top-end="$t('FILTER.CLEAR_BUTTON_LABEL')"
            variant="destructive"
            size="icon"
            @click="emit('resetFilters')"
          >
            <Icon icon="i-lucide-circle-x" />
          </Button>
        </template>
        <template v-if="hasActiveFolders">
          <div class="relative">
            <Button
              id="toggleConversationFilterButton"
              v-tooltip.top-end="$t('FILTER.CUSTOM_VIEWS.EDIT.EDIT_BUTTON')"
              variant="ghost"
              size="icon"
              @click="emit('filtersModal')"
            >
              <Icon icon="i-lucide-pen-line" />
            </Button>
            <div
              id="conversationFilterTeleportTarget"
              class="absolute z-50 mt-2"
              :class="{ 'ltr:right-0 rtl:left-0': isOnExpandedLayout }"
            />
          </div>
          <Button
            id="toggleConversationFilterButton"
            v-tooltip.top-end="$t('FILTER.CUSTOM_VIEWS.DELETE.DELETE_BUTTON')"
            variant="destructive"
            size="icon"
            @click="emit('deleteFolders')"
          >
            <Icon icon="i-lucide-trash-2" />
          </Button>
        </template>
        <div v-else class="relative">
          <Button
            id="toggleConversationFilterButton"
            v-tooltip.right="$t('FILTER.TOOLTIP_LABEL')"
            variant="ghost"
            size="icon"
            @click="emit('filtersModal')"
          >
            <Icon icon="i-lucide-list-filter" />
          </Button>
          <div
            id="conversationFilterTeleportTarget"
            class="absolute z-50 mt-2"
            :class="{ 'ltr:right-0 rtl:left-0': isOnExpandedLayout }"
          />
        </div>
        <ConversationBasicFilter
          v-if="!hasAppliedFiltersOrActiveFolders"
          :is-on-expanded-layout="isOnExpandedLayout"
          @change-filter="onBasicFilterChange"
        />
        <SwitchLayout
          :is-on-expanded-layout="isOnExpandedLayout"
          @toggle="toggleConversationLayout"
        />
      </div>
    </div>
    <!-- Search + Compose row -->
    <div class="flex items-center gap-1.5 px-3 pb-2">
      <AppLink
        :to="{ name: 'search' }"
        class="flex flex-1 items-center gap-2 h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm text-n-slate-11 hover:border-n-strong hover:text-n-slate-12 transition-colors min-w-0 shadow-xs"
        :aria-label="$t('COMBOBOX.SEARCH_PLACEHOLDER')"
      >
        <Icon icon="i-lucide-search" />
        <span class="truncate">{{ $t('COMBOBOX.SEARCH_PLACEHOLDER') }}</span>
      </AppLink>
      <ComposeConversation align-position="right" />
    </div>
  </div>
</template>
