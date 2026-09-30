<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store.js';
import { getUnixTime } from 'date-fns';
import { findSnoozeTime } from 'dashboard/helper/snoozeHelpers';
import { emitter } from 'shared/helpers/mitt';
import { useBulkActions } from 'dashboard/composables/chatlist/useBulkActions.js';
import wootConstants from 'dashboard/constants/globals';
import {
  CMD_BULK_ACTION_SNOOZE_CONVERSATION,
  CMD_BULK_ACTION_REOPEN_CONVERSATION,
  CMD_BULK_ACTION_RESOLVE_CONVERSATION,
} from 'dashboard/helper/commandbar/events';

import { Button } from 'dashboard/components-next/ui/button';
import { Card, CardContent } from 'dashboard/components-next/ui/card';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import BulkAgentActions from './BulkAgentActions.vue';
import BulkUpdateActions from './BulkUpdateActions.vue';
import BulkLabelActions from './BulkLabelActions.vue';
import BulkTeamActions from './BulkTeamActions.vue';
import CustomSnoozeModal from 'dashboard/components/CustomSnoozeModal.vue';

const props = defineProps({
  conversations: {
    type: Array,
    default: () => [],
  },
  allConversationsSelected: {
    type: Boolean,
    default: false,
  },
  selectedInboxes: {
    type: Array,
    default: () => [],
  },
  showOpenAction: {
    type: Boolean,
    default: false,
  },
  showResolvedAction: {
    type: Boolean,
    default: false,
  },
  showSnoozedAction: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['selectAllConversations']);

const { t } = useI18n();

const {
  selectedConversations,
  onAssignAgent,
  onAssignLabels,
  onRemoveLabels,
  onAssignTeamsForBulk: onAssignTeam,
  onUpdateConversations,
} = useBulkActions();

const getConversationById = useMapGetter('getConversationById');

const appliedLabelsForSelection = computed(() => {
  const applied = new Set();
  selectedConversations.value.forEach(id => {
    const conversation = getConversationById.value(id);
    (conversation?.labels || []).forEach(label => applied.add(label));
  });
  return Array.from(applied);
});

const selectedLabel = computed(() =>
  t('BULK_ACTION.CONVERSATIONS_SELECTED', {
    conversationCount: props.conversations.length,
  })
);

const showCustomTimeSnoozeModal = ref(false);

function onCmdSnoozeConversation(snoozeType) {
  if (snoozeType === wootConstants.SNOOZE_OPTIONS.UNTIL_CUSTOM_TIME) {
    showCustomTimeSnoozeModal.value = true;
  } else if (typeof snoozeType === 'number') {
    onUpdateConversations('snoozed', snoozeType);
  } else {
    onUpdateConversations('snoozed', findSnoozeTime(snoozeType) || null);
  }
}

function onCmdReopenConversation() {
  onUpdateConversations('open', null);
}

function onCmdResolveConversation() {
  onUpdateConversations('resolved', null);
}

function customSnoozeTime(customSnoozedTime) {
  showCustomTimeSnoozeModal.value = false;
  if (customSnoozedTime) {
    onUpdateConversations('snoozed', getUnixTime(customSnoozedTime));
  }
}

function hideCustomSnoozeModal() {
  showCustomTimeSnoozeModal.value = false;
}

const selectAll = checked => {
  emit('selectAllConversations', checked === true);
};

onMounted(() => {
  emitter.on(CMD_BULK_ACTION_SNOOZE_CONVERSATION, onCmdSnoozeConversation);
  emitter.on(CMD_BULK_ACTION_REOPEN_CONVERSATION, onCmdReopenConversation);
  emitter.on(CMD_BULK_ACTION_RESOLVE_CONVERSATION, onCmdResolveConversation);
});

onUnmounted(() => {
  emitter.off(CMD_BULK_ACTION_SNOOZE_CONVERSATION, onCmdSnoozeConversation);
  emitter.off(CMD_BULK_ACTION_REOPEN_CONVERSATION, onCmdReopenConversation);
  emitter.off(CMD_BULK_ACTION_RESOLVE_CONVERSATION, onCmdResolveConversation);
});
</script>

<!-- eslint-disable-next-line vue/no-root-v-if -->
<template>
  <div v-if="conversations.length > 0" class="border-b flex flex-col gap-2 p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1 min-w-0">
        <label class="flex items-center gap-1.5 min-w-0 cursor-pointer">
          <Checkbox
            :checked="allConversationsSelected ? true : 'indeterminate'"
            class="flex-shrink-0"
            @update:checked="selectAll"
          />
          <span :title="selectedLabel" class="text-xs truncate">
            {{ selectedLabel }}
          </span>
        </label>
        <Button
          variant="link"
          size="sm"
          class="flex-shrink-0 h-6 px-1"
          @click="selectAll(false)"
        >
          {{ $t('BULK_ACTION.CLEAR_SELECTION') }}
        </Button>
      </div>

      <div class="flex items-center gap-1 flex-shrink-0">
        <BulkLabelActions @assign="onAssignLabels" />
        <BulkLabelActions
          action="remove"
          :applied-labels="appliedLabelsForSelection"
          @remove="onRemoveLabels"
        />
        <BulkUpdateActions
          :show-resolve="!showResolvedAction"
          :show-reopen="!showOpenAction"
          :show-snooze="!showSnoozedAction"
          @update="status => onUpdateConversations(status, null)"
        />
        <BulkAgentActions
          :selected-inboxes="selectedInboxes"
          :conversation-count="conversations.length"
          @select="onAssignAgent"
        />
        <BulkTeamActions
          :conversation-count="conversations.length"
          @select="onAssignTeam"
        />
      </div>
    </div>

    <Card
      v-if="allConversationsSelected"
      class="bg-n-amber-3 text-amber-950 py-3 text-xs shadow-amber-200 border-amber-100"
    >
      <CardContent>
        {{ $t('BULK_ACTION.ALL_CONVERSATIONS_SELECTED_ALERT') }}
      </CardContent>
    </Card>

    <CustomSnoozeModal
      :open="showCustomTimeSnoozeModal"
      @close="hideCustomSnoozeModal"
      @choose-time="customSnoozeTime"
    />
  </div>
</template>
