<script setup>
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { router as inertiaRouter } from '@inertiajs/vue3';
import { useAlert } from 'dashboard/composables';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useConversationRoutePath } from 'dashboard/composables/useConversationRoutePath';
import { useUISettings } from 'dashboard/composables/useUISettings';
import wootConstants from 'dashboard/constants/globals';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  contact: {
    type: Object,
    required: true,
  },
});

const store = useStore();
const { currentRouteName } = useAppNavigation();
const { t } = useI18n();
const { buildConversationPath, buildConversationListPath, isOnFolderView } =
  useConversationRoutePath();
const { isOnExpandedLayout } = useUISettings();

const neighbours = useMapGetter(
  'contactConversations/getConversationNeighbours'
);
const selectedChat = useMapGetter('getSelectedChat');
const conversationById = useMapGetter('getConversationById');

// Needs more than the open conversation, and a list to scope — the inbox view has none.
const isVisible = computed(() => {
  if (String(currentRouteName.value || '').startsWith('inbox_view')) {
    return false;
  }
  return neighbours.value(selectedChat.value?.id).length > 1;
});

// Applying a filter empties the store; refetch the open conversation if it was dropped.
const restoreOpenConversation = conversationId => {
  if (!conversationId) return;
  if (!conversationById.value(conversationId)) {
    store.dispatch('getConversation', conversationId);
  }
};

const visitAndWait = path =>
  new Promise(resolve => {
    inertiaRouter.visit(path, { onFinish: () => resolve() });
  });

// A folder narrows the list to its own query, so the history has to leave that scope.
const viewAllConversations = async () => {
  // The expanded layout moves to the list, so there is no open thread left to keep.
  const openConversationId = isOnExpandedLayout.value
    ? null
    : selectedChat.value?.id;

  if (isOnExpandedLayout.value) {
    await visitAndWait(buildConversationListPath({ keepFolderScope: false }));
    // Leaving a folder resets the list, which would drop a filter applied before it.
    await nextTick();
  } else if (isOnFolderView.value) {
    await visitAndWait(
      buildConversationPath(openConversationId, { keepFolderScope: false })
    );
    await nextTick();
  }

  store
    .dispatch('applyConversationFilters', {
      filters: [
        {
          attribute_key: 'contact_id',
          attribute_model: 'standard',
          filter_operator: 'equal_to',
          query_operator: 'and',
          custom_attribute_type: '',
          values: [{ id: props.contact.id, name: props.contact.name }],
        },
      ],
      // Match the chronological order of the in-thread navigation.
      sortBy: wootConstants.SORT_BY_TYPE.CREATED_AT_DESC,
    })
    .catch(() => useAlert(t('CHAT_LIST.FETCH_ERROR')))
    .finally(() => restoreOpenConversation(openConversationId));
};
</script>

<template>
  <Button
    v-if="isVisible"
    v-tooltip.top-end="$t('CONTACT_PANEL.CONVERSATIONS.VIEW_ALL')"
    :aria-label="$t('CONTACT_PANEL.CONVERSATIONS.VIEW_ALL')"
    variant="outline"
    size="icon"
    @click="viewAllConversations"
  >
    <Icon icon="i-lucide-history" />
  </Button>
</template>
