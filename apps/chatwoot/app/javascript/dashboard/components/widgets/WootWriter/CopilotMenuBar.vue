<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import { REPLY_EDITOR_MODES } from 'dashboard/components/widgets/WootWriter/constants';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import Icon from 'next/icon/Icon.vue';

const props = defineProps({
  // Signature-aware emptiness is computed by the parent (which has access to
  // the signature + channel context) and passed in as a boolean.
  hasContent: {
    type: Boolean,
    default: false,
  },
  conversationId: {
    type: Number,
    default: null,
  },
  side: {
    type: String,
    default: 'top',
  },
  align: {
    type: String,
    default: 'end',
  },
});

const emit = defineEmits(['executeCopilotAction']);

const { t } = useI18n();

const replyMode = useMapGetter('draftMessages/getReplyEditorMode');

// Selection-based menu items (when text is selected)
const menuItems = computed(() => {
  const items = [];
  // for now, we don't allow improving just  aprt of the selection
  // we will add this feature later. Once we do, we can revert the change
  const hasSelection = false;

  if (hasSelection) {
    items.push({
      label: t(
        'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.IMPROVE_REPLY_SELECTION'
      ),
      key: 'improve_selection',
      icon: 'i-fluent-pen-sparkle-24-regular',
    });
  } else if (
    props.conversationId &&
    replyMode.value === REPLY_EDITOR_MODES.REPLY &&
    props.hasContent
  ) {
    items.push({
      label: t('INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.IMPROVE_REPLY'),
      key: 'improve',
      icon: 'i-fluent-pen-sparkle-24-regular',
    });
  }

  if (props.hasContent) {
    items.push(
      {
        label: t(
          'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.CHANGE_TONE.TITLE'
        ),
        key: 'change_tone',
        icon: 'i-fluent-sound-wave-circle-sparkle-24-regular',
        subMenuItems: [
          {
            label: t(
              'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.CHANGE_TONE.OPTIONS.PROFESSIONAL'
            ),
            key: 'professional',
          },
          {
            label: t(
              'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.CHANGE_TONE.OPTIONS.CASUAL'
            ),
            key: 'casual',
          },
          {
            label: t(
              'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.CHANGE_TONE.OPTIONS.STRAIGHTFORWARD'
            ),
            key: 'straightforward',
          },
          {
            label: t(
              'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.CHANGE_TONE.OPTIONS.CONFIDENT'
            ),
            key: 'confident',
          },
          {
            label: t(
              'INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.CHANGE_TONE.OPTIONS.FRIENDLY'
            ),
            key: 'friendly',
          },
        ],
      },
      {
        label: t('INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.GRAMMAR'),
        key: 'fix_spelling_grammar',
        icon: 'i-fluent-flow-sparkle-24-regular',
      }
    );
  }
  return items;
});

const generalMenuItems = computed(() => {
  const items = [];
  if (props.conversationId && replyMode.value === REPLY_EDITOR_MODES.REPLY) {
    items.push({
      label: t('INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.SUGGESTION'),
      key: 'reply_suggestion',
      icon: 'i-fluent-chat-sparkle-16-regular',
    });
  }

  if (props.conversationId) {
    items.push({
      label: t('INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.SUMMARIZE'),
      key: 'summarize',
      icon: 'i-fluent-text-bullet-list-square-sparkle-32-regular',
    });
  }

  items.push({
    label: t('INTEGRATION_SETTINGS.OPEN_AI.REPLY_OPTIONS.ASK_COPILOT'),
    key: 'ask_copilot',
    icon: 'i-fluent-circle-sparkle-24-regular',
  });

  return items;
});

const handleMenuItemClick = item => {
  emit('executeCopilotAction', item.key);
};
</script>

<template>
  <DropdownMenuContent :side="side" :align="align" class="min-w-56">
    <template v-for="item in menuItems" :key="item.key">
      <DropdownMenuSub v-if="item.subMenuItems">
        <DropdownMenuSubTrigger>
          <Icon :icon="item.icon" />
          <span class="min-w-0 truncate">{{ item.label }}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="min-w-32">
          <DropdownMenuItem
            v-for="subItem in item.subMenuItems"
            :key="subItem.key + subItem.label"
            @select="handleMenuItemClick(subItem)"
          >
            {{ subItem.label }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem v-else @select="handleMenuItemClick(item)">
        <Icon :icon="item.icon" />
        {{ item.label }}
      </DropdownMenuItem>
    </template>
    <DropdownMenuSeparator v-if="menuItems.length > 0" />
    <DropdownMenuItem
      v-for="item in generalMenuItems"
      :key="item.key"
      @select="handleMenuItemClick(item)"
    >
      <Icon :icon="item.icon" />
      {{ item.label }}
    </DropdownMenuItem>
  </DropdownMenuContent>
</template>
