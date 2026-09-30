<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Switch } from 'dashboard/components-next/ui/switch';
import Policy from 'dashboard/components/policy.vue';
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
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  authType: {
    type: String,
    default: 'none',
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  isUpdating: {
    type: Boolean,
    default: false,
  },
  updatedAt: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['action', 'toggle']);

const exactTimestamp = useExactTimestamp();

const { t } = useI18n();

const isOpen = ref(false);

const enabledState = computed({
  get: () => props.enabled,
  set: enabled => emit('toggle', { id: props.id, enabled }),
});

const statusLabel = computed(() =>
  props.enabled
    ? t('CAPTAIN.CUSTOM_TOOLS.STATUS.ENABLED')
    : t('CAPTAIN.CUSTOM_TOOLS.STATUS.DISABLED')
);

const menuItems = computed(() => [
  {
    label: t('CAPTAIN.CUSTOM_TOOLS.OPTIONS.EDIT_TOOL'),
    value: 'edit',
    action: 'edit',
    icon: 'i-lucide-pencil-line',
  },
  {
    label: t('CAPTAIN.CUSTOM_TOOLS.OPTIONS.DELETE_TOOL'),
    value: 'delete',
    action: 'delete',
    icon: 'i-lucide-trash',
  },
]);

const timestamp = computed(() =>
  dynamicTime(props.updatedAt || props.createdAt)
);

const handleAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value, id: props.id });
};

const authTypeLabel = computed(() => {
  return t(
    `CAPTAIN.CUSTOM_TOOLS.FORM.AUTH_TYPES.${props.authType.toUpperCase()}`
  );
});
</script>

<template>
  <CardLayout class="relative">
    <div class="flex relative justify-between w-full gap-1">
      <span class="text-base text-n-slate-12 line-clamp-1 font-medium">
        {{ title }}
      </span>
      <div class="flex items-center gap-2">
        <span class="text-xs text-n-slate-11">
          {{ statusLabel }}
        </span>
        <Policy
          as="span"
          :permissions="['administrator']"
          class="inline-flex items-center"
        >
          <Switch
            v-model="enabledState"
            :disabled="isUpdating"
            :aria-label="t('CAPTAIN.CUSTOM_TOOLS.STATUS.TOGGLE', { title })"
            :class="{ 'opacity-50 cursor-not-allowed': isUpdating }"
          />
        </Policy>
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
                @click="handleAction(item)"
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
    <div class="flex items-center justify-between w-full gap-4 min-w-0">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <span v-if="description" class="text-sm truncate text-n-slate-11">
          {{ description }}
        </span>
        <span
          v-if="authType !== 'none'"
          class="text-sm shrink-0 text-n-slate-11 inline-flex items-center gap-1"
        >
          <i class="i-lucide-lock text-base" />
          {{ authTypeLabel }}
        </span>
      </div>
      <span
        v-tooltip.top="{
          content: exactTimestamp(updatedAt || createdAt),
          delay: { show: 500, hide: 0 },
        }"
        class="text-sm text-n-slate-11 line-clamp-1 shrink-0"
      >
        {{ timestamp }}
      </span>
    </div>
  </CardLayout>
</template>
