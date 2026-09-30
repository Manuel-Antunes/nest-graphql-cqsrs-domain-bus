<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CONVERSATION_PRIORITY } from 'shared/constants/messages';

const props = withDefaults(
  defineProps<{
    priority?: string;
  }>(),
  {
    priority: '',
  }
);

const { t } = useI18n();

const tooltipText = computed(() =>
  t(`CONVERSATION.PRIORITY.OPTIONS.${props.priority.toUpperCase()}`)
);

const isUrgent = computed(
  () => props.priority === CONVERSATION_PRIORITY.URGENT
);
</script>

<!-- eslint-disable-next-line vue/no-root-v-if -->
<template>
  <span
    v-if="priority"
    v-tooltip="{
      content: tooltipText,
      delay: { show: 1500, hide: 0 },
      hideOnClick: true,
    }"
    class="shrink-0 rounded-sm inline-flex items-center justify-center w-3.5 h-3.5"
    :class="{
      'bg-n-ruby-4 text-n-ruby-10': isUrgent,
      'bg-n-slate-4 text-n-slate-11': !isUrgent,
    }"
  >
    <fluent-icon
      :icon="`priority-${priority.toLowerCase()}`"
      :size="isUrgent ? 12 : 14"
      class="flex-shrink-0"
      view-box="0 0 14 14"
    />
  </span>
</template>
