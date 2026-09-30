<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button component name */
import { ref } from 'vue';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import { useCaptain } from 'dashboard/composables/useCaptain';
import { useTrack } from 'dashboard/composables';
import { REPLY_EDITOR_MODES, CHAR_LENGTH_WARNING } from './constants';
import { CAPTAIN_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Tabs, TabsList, TabsTrigger } from 'dashboard/components-next/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import CopilotMenuBar from './CopilotMenuBar.vue';

export default {
  name: 'ReplyTopPanel',
  components: {
    Button,
    Icon,
    Tabs,
    TabsList,
    TabsTrigger,
    DropdownMenu,
    DropdownMenuTrigger,
    CopilotMenuBar,
  },
  props: {
    mode: {
      type: String,
      default: REPLY_EDITOR_MODES.REPLY,
    },
    isReplyRestricted: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    isEditorDisabled: {
      type: Boolean,
      default: false,
    },
    conversationId: {
      type: Number,
      default: null,
    },
    isMessageLengthReachingThreshold: {
      type: Boolean,
      default: () => false,
    },
    charactersRemaining: {
      type: Number,
      default: () => 0,
    },
    editorContent: {
      type: String,
      default: undefined,
    },
    hasContent: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['setReplyMode', 'executeCopilotAction'],
  setup(props, { emit }) {
    const setReplyMode = mode => {
      emit('setReplyMode', mode);
    };
    const handleReplyClick = () => {
      if (props.isReplyRestricted) return;
      setReplyMode(REPLY_EDITOR_MODES.REPLY);
    };
    const handleNoteClick = () => {
      setReplyMode(REPLY_EDITOR_MODES.NOTE);
    };

    const { captainTasksEnabled } = useCaptain();
    const showCopilotMenu = ref(false);

    const handleCopilotAction = (actionKey, data) => {
      emit('executeCopilotAction', actionKey, data || props.editorContent);
      showCopilotMenu.value = false;
    };

    const onCopilotMenuOpenChange = isOpening => {
      if (isOpening) {
        useTrack(CAPTAIN_EVENTS.EDITOR_AI_MENU_OPENED, {
          conversationId: props.conversationId,
          entryPoint: 'top_panel',
        });
      }
      showCopilotMenu.value = isOpening;
    };

    const keyboardEvents = {
      'Alt+KeyP': {
        action: () => handleNoteClick(),
        allowOnFocusedInput: false,
      },
      'Alt+KeyL': {
        action: () => handleReplyClick(),
        allowOnFocusedInput: false,
      },
    };
    useKeyboardEvents(keyboardEvents);

    return {
      setReplyMode,
      REPLY_EDITOR_MODES,
      captainTasksEnabled,
      handleCopilotAction,
      showCopilotMenu,
      onCopilotMenuOpenChange,
    };
  },
  computed: {
    activeMode() {
      return this.isReplyRestricted ? REPLY_EDITOR_MODES.NOTE : this.mode;
    },
    isNoteActive() {
      return this.activeMode === REPLY_EDITOR_MODES.NOTE;
    },
    charLengthClass() {
      return this.charactersRemaining < 0 ? 'text-n-ruby-9' : 'text-n-slate-11';
    },
    characterLengthWarning() {
      return this.charactersRemaining < 0
        ? `${-this.charactersRemaining} ${CHAR_LENGTH_WARNING.NEGATIVE}`
        : `${this.charactersRemaining} ${CHAR_LENGTH_WARNING.UNDER_50}`;
    },
  },
};
</script>

<template>
  <div class="flex items-center justify-between gap-2 px-2 pt-2">
    <Tabs :model-value="activeMode" @update:model-value="setReplyMode">
      <TabsList :class="isNoteActive ? 'bg-n-black/5' : ''">
        <TabsTrigger
          :value="REPLY_EDITOR_MODES.REPLY"
          :disabled="disabled || isReplyRestricted"
        >
          {{ $t('CONVERSATION.REPLYBOX.REPLY') }}
        </TabsTrigger>
        <TabsTrigger :value="REPLY_EDITOR_MODES.NOTE" :disabled="disabled">
          {{ $t('CONVERSATION.REPLYBOX.PRIVATE_NOTE') }}
        </TabsTrigger>
      </TabsList>
    </Tabs>
    <div class="flex items-center gap-2">
      <span
        v-if="isMessageLengthReachingThreshold"
        class="text-xs"
        :class="charLengthClass"
      >
        {{ characterLengthWarning }}
      </span>
      <DropdownMenu
        v-if="captainTasksEnabled"
        :open="showCopilotMenu"
        @update:open="onCopilotMenuOpenChange"
      >
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :disabled="disabled || isEditorDisabled"
            :class="{
              'text-n-violet-9 hover:enabled:!bg-n-violet-3': !showCopilotMenu,
              'text-n-violet-9 bg-n-violet-3': showCopilotMenu,
            }"
          >
            <Icon icon="i-ph-sparkle-fill" />
          </Button>
        </DropdownMenuTrigger>
        <CopilotMenuBar
          :has-content="hasContent"
          :conversation-id="conversationId"
          @execute-copilot-action="handleCopilotAction"
        />
      </DropdownMenu>
    </div>
  </div>
</template>
