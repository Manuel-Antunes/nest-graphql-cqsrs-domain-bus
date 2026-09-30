<script setup>
import { ref, computed } from 'vue';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import { useStore, useStoreGetters } from 'dashboard/composables/store';
import { useEmitter } from 'dashboard/composables/emitter';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';

import wootConstants from 'dashboard/constants/globals';
import {
  CMD_REOPEN_CONVERSATION,
  CMD_RESOLVE_CONVERSATION,
} from 'dashboard/helper/commandbar/events';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';

const store = useStore();
const getters = useStoreGetters();
const { t } = useI18n();

const arrowDownButtonRef = ref(null);
const isLoading = ref(false);

const currentChat = computed(() => getters.getSelectedChat.value);

const isOpen = computed(
  () => currentChat.value.status === wootConstants.STATUS_TYPE.OPEN
);
const isPending = computed(
  () => currentChat.value.status === wootConstants.STATUS_TYPE.PENDING
);
const isResolved = computed(
  () => currentChat.value.status === wootConstants.STATUS_TYPE.RESOLVED
);
const isSnoozed = computed(
  () => currentChat.value.status === wootConstants.STATUS_TYPE.SNOOZED
);

const showAdditionalActions = computed(
  () => !isPending.value && !isSnoozed.value
);

const showOpenButton = computed(() => {
  return isPending.value || isSnoozed.value;
});

const getConversationParams = () => {
  const allConversations = document.querySelectorAll(
    '.conversations-list .conversation'
  );

  const activeConversation = document.querySelector(
    'div.conversations-list div.conversation.active'
  );
  const activeConversationIndex = [...allConversations].indexOf(
    activeConversation
  );
  const lastConversationIndex = allConversations.length - 1;

  return {
    all: allConversations,
    activeIndex: activeConversationIndex,
    lastIndex: lastConversationIndex,
  };
};

const openSnoozeModal = () => {
  const ninja = document.querySelector('ninja-keys');
  ninja.open({ parent: 'snooze_conversation' });
};

const toggleStatus = (status, snoozedUntil) => {
  isLoading.value = true;
  store
    .dispatch('toggleStatus', {
      conversationId: currentChat.value.id,
      status,
      snoozedUntil,
    })
    .then(() => {
      useAlert(t('CONVERSATION.CHANGE_STATUS'));
      isLoading.value = false;
    });
};

const onCmdOpenConversation = () => {
  toggleStatus(wootConstants.STATUS_TYPE.OPEN);
};

const onCmdResolveConversation = () => {
  toggleStatus(wootConstants.STATUS_TYPE.RESOLVED);
};

const keyboardEvents = {
  'Alt+KeyM': {
    action: () => arrowDownButtonRef.value?.$el.click(),
    allowOnFocusedInput: true,
  },
  'Alt+KeyE': {
    action: async () => {
      await toggleStatus(wootConstants.STATUS_TYPE.RESOLVED);
    },
  },
  '$mod+Alt+KeyE': {
    action: async event => {
      const { all, activeIndex, lastIndex } = getConversationParams();
      await toggleStatus(wootConstants.STATUS_TYPE.RESOLVED);

      if (activeIndex < lastIndex) {
        all[activeIndex + 1].click();
      } else if (all.length > 1) {
        all[0].click();
        document.querySelector('.conversations-list').scrollTop = 0;
      }
      event.preventDefault();
    },
  },
};

useKeyboardEvents(keyboardEvents);

useEmitter(CMD_REOPEN_CONVERSATION, onCmdOpenConversation);
useEmitter(CMD_RESOLVE_CONVERSATION, onCmdResolveConversation);
</script>

<template>
  <div class="flex items-center justify-end resolve-actions">
    <div class="flex">
      <Button
        v-if="isOpen"
        variant="outline"
        class="border-r-0 rounded-r-none"
        :disabled="isLoading"
        @click="onCmdResolveConversation"
      >
        <Spinner v-if="isLoading" class="size-6" />
        {{ t('CONVERSATION.HEADER.RESOLVE_ACTION') }}
      </Button>
      <Button
        v-else-if="isResolved"
        variant="outline"
        class="border-r-0 rounded-r-none"
        :disabled="isLoading"
        @click="onCmdOpenConversation"
      >
        <Spinner v-if="isLoading" class="size-6" />
        {{ t('CONVERSATION.HEADER.REOPEN_ACTION') }}
      </Button>
      <Button
        v-else-if="showOpenButton"
        variant="outline"
        :disabled="isLoading"
        @click="onCmdOpenConversation"
      >
        <Spinner v-if="isLoading" class="size-6" />
        {{ t('CONVERSATION.HEADER.OPEN_ACTION') }}
      </Button>
      <DropdownMenu v-if="showAdditionalActions">
        <DropdownMenuTrigger as-child>
          <Button
            ref="arrowDownButtonRef"
            variant="outline"
            class="border-l-0 rounded-l-none"
            :disabled="isLoading"
          >
            <Icon icon="i-lucide-chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem v-if="!isPending" @select="openSnoozeModal">
            <Icon icon="i-lucide-alarm-clock-minus" />
            {{ t('CONVERSATION.RESOLVE_DROPDOWN.SNOOZE_UNTIL') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="!isPending"
            @select="toggleStatus(wootConstants.STATUS_TYPE.PENDING)"
          >
            <Icon icon="i-lucide-circle-dot-dashed" />
            {{ t('CONVERSATION.RESOLVE_DROPDOWN.MARK_PENDING') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
