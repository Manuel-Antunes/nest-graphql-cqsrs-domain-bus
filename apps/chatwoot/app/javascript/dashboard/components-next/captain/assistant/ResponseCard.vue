<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';
import { usePolicy } from 'dashboard/composables/usePolicy';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import Policy from 'dashboard/components/policy.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  id: {
    type: Number,
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    default: 'approved',
  },
  documentable: {
    type: Object,
    default: null,
  },
  assistant: {
    type: Object,
    default: () => ({}),
  },
  updatedAt: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Number,
    required: true,
  },
  usedInConversationsCount: {
    type: Number,
    default: null,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  showMenu: {
    type: Boolean,
    default: true,
  },
  showActions: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'action',
  'navigate',
  'select',
  'hover',
  'viewConversations',
]);

const exactTimestamp = useExactTimestamp();

const { t } = useI18n();
const { checkPermissions } = usePolicy();

const isOpen = ref(false);

const modelValue = computed({
  get: () => props.isSelected,
  set: () => emit('select', props.id),
});

const statusAction = computed(() => {
  if (props.status === 'pending') {
    return [
      {
        label: t('CAPTAIN.RESPONSES.OPTIONS.APPROVE'),
        value: 'approve',
        action: 'approve',
        icon: 'i-lucide-circle-check-big',
      },
    ];
  }
  return [];
});

const menuItems = computed(() => [
  ...statusAction.value,
  {
    label: t('CAPTAIN.RESPONSES.OPTIONS.EDIT_RESPONSE'),
    value: 'edit',
    action: 'edit',
    icon: 'i-lucide-pencil-line',
  },
  {
    label: t('CAPTAIN.RESPONSES.OPTIONS.DELETE_RESPONSE'),
    value: 'delete',
    action: 'delete',
    icon: 'i-lucide-trash',
  },
]);

const timestamp = computed(() =>
  dynamicTime(props.updatedAt || props.createdAt)
);
const canManage = computed(() => checkPermissions(['administrator']));
const hasConversationUsage = computed(
  () =>
    props.documentable?.type === 'User' &&
    props.usedInConversationsCount !== null
);
const usedInConversationsLabel = computed(() =>
  t('CAPTAIN.DOCUMENTS.USED_IN_CONVERSATIONS', {
    n: props.usedInConversationsCount,
  })
);
const usedInConversationsCountText = computed(() =>
  String(props.usedInConversationsCount)
);

const handleAssistantAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value, id: props.id });
};

const handleDocumentableClick = () => {
  emit('navigate', {
    id: props.documentable.id,
    type: props.documentable.type,
  });
};

const handleViewConversations = () => {
  if (!props.usedInConversationsCount) return;

  emit('viewConversations', props.id);
};
</script>

<template>
  <CardLayout
    selectable
    class="relative"
    :class="{ 'rounded-md': compact }"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
  >
    <div v-show="selectable" class="absolute top-7 ltr:left-3 rtl:right-3">
      <Checkbox v-model:checked="modelValue" />
    </div>
    <div class="flex relative justify-between w-full gap-1">
      <span class="text-base text-n-slate-12 line-clamp-1">
        {{ question }}
      </span>
      <div v-if="!compact && showMenu" class="flex items-center gap-2">
        <Policy :permissions="['administrator']">
          <Popover v-model:open="isOpen">
            <PopoverTrigger as-child>
              <Button variant="outline" size="icon">
                <Icon icon="i-lucide-ellipsis-vertical" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              class="flex flex-col p-1 w-auto min-w-36"
            >
              <Button
                v-for="item in menuItems"
                :key="item.value"
                variant="ghost"
                class="justify-start"
                :class="
                  item.action === 'delete'
                    ? 'text-destructive hover:text-destructive'
                    : ''
                "
                :disabled="item.disabled"
                @click="handleAssistantAction(item)"
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
        </Policy>
      </div>
    </div>
    <span class="text-n-slate-11 text-sm line-clamp-5">
      {{ answer }}
    </span>
    <div
      v-if="!compact"
      class="flex items-start justify-between flex-col-reverse md:flex-row gap-3"
    >
      <Policy v-if="showActions" :permissions="['administrator']">
        <div class="flex items-center gap-2 sm:gap-5 w-full">
          <Button
            v-if="status === 'pending'"
            variant="link"
            class="hover:!no-underline"
            @click="
              handleAssistantAction({ action: 'approve', value: 'approve' })
            "
          >
            <Icon icon="i-lucide-circle-check-big" class="size-4" />{{
              $t('CAPTAIN.RESPONSES.OPTIONS.APPROVE')
            }}
          </Button>
          <Button
            variant="link"
            @click="
              handleAssistantAction({
                action: 'edit',
                value: 'edit',
              })
            "
          >
            <Icon icon="i-lucide-pencil-line" />{{
              $t('CAPTAIN.RESPONSES.OPTIONS.EDIT_RESPONSE')
            }}
          </Button>
          <Button
            variant="link"
            class="hover:!no-underline text-destructive"
            @click="
              handleAssistantAction({ action: 'delete', value: 'delete' })
            "
          >
            <Icon icon="i-lucide-trash" class="size-4" />{{
              $t('CAPTAIN.RESPONSES.OPTIONS.DELETE_RESPONSE')
            }}
          </Button>
        </div>
      </Policy>
      <div
        class="flex items-center gap-3"
        :class="{ 'justify-between w-full': !showActions }"
      >
        <div class="inline-flex items-center gap-3 min-w-0">
          <span
            v-if="status === 'approved'"
            class="text-sm shrink-0 truncate text-n-slate-11 inline-flex items-center gap-1"
          >
            <Icon icon="i-woot-captain" class="size-3.5" />
            {{ assistant?.name || '' }}
          </span>
          <div
            v-if="documentable"
            class="text-sm text-n-slate-11 grid grid-cols-[auto_1fr] items-center gap-1 min-w-0"
          >
            <Icon
              v-if="documentable.type === 'Captain::Document'"
              icon="i-ph-files-light"
              class="size-3.5"
            />
            <Icon
              v-else-if="documentable.type === 'User'"
              icon="i-ph-user-circle-plus"
              class="size-3.5"
            />
            <Icon
              v-else-if="documentable.type === 'Conversation'"
              icon="i-ph-chat-circle-dots"
              class="size-3.5"
            />
            <span
              v-if="documentable.type === 'Captain::Document'"
              class="truncate"
              :title="documentable.name"
            >
              {{ documentable.name }}
            </span>
            <span
              v-else-if="documentable.type === 'User'"
              class="truncate"
              :title="documentable.available_name"
            >
              {{ documentable.available_name }}
            </span>
            <span
              v-else-if="documentable.type === 'Conversation'"
              class="hover:underline truncate cursor-pointer"
              role="button"
              @click="handleDocumentableClick"
            >
              {{
                t(`CAPTAIN.RESPONSES.DOCUMENTABLE.CONVERSATION`, {
                  id: documentable.display_id,
                })
              }}
            </span>
          </div>
        </div>
        <div class="inline-flex shrink-0 items-center gap-3">
          <Button
            v-if="canManage && hasConversationUsage"
            v-tooltip.top="usedInConversationsLabel"
            variant="link"
            size="xs"
            class="!px-0 text-n-slate-11"
            :aria-label="usedInConversationsLabel"
            :disabled="!usedInConversationsCount"
            @click.stop="handleViewConversations"
          >
            <Icon icon="i-lucide-messages-square" class="size-3.5" />
            {{ usedInConversationsCountText }}
          </Button>
          <div
            v-tooltip.top="{
              content: exactTimestamp(updatedAt || createdAt),
              delay: { show: 500, hide: 0 },
            }"
            class="shrink-0 text-sm text-n-slate-11 line-clamp-1 inline-flex items-center gap-1"
          >
            <Icon icon="i-ph-calendar-dot" class="size-3.5" />
            {{ timestamp }}
          </div>
        </div>
      </div>
    </div>
  </CardLayout>
</template>
