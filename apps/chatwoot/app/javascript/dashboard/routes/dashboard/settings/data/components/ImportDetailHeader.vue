<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import BaseSettingsHeader from '../../components/BaseSettingsHeader.vue';
import {
  POLL_INTERVAL_MS,
  importStageKey,
  isAbandonableImport,
  isActiveImport,
  statusDotClass as getStatusDotClass,
} from '../importStatus';

const props = defineProps({
  dataImport: {
    type: Object,
    default: null,
  },
  isRefreshing: {
    type: Boolean,
    default: false,
  },
  isRetrying: {
    type: Boolean,
    default: false,
  },
  isAbandoning: {
    type: Boolean,
    default: false,
  },
  isPolling: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['refresh', 'retry', 'abandon']);

const { t } = useI18n();

const pollIntervalSeconds = POLL_INTERVAL_MS / 1000;

const title = computed(
  () => props.dataImport?.name || t('DATA_IMPORTS.TABLE.UNNAMED')
);

const stageLabels = computed(() => ({
  unknown: t('DATA_IMPORTS.MONITOR.STAGES.unknown'),
  queued: t('DATA_IMPORTS.MONITOR.STAGES.queued'),
  contacts: t('DATA_IMPORTS.MONITOR.STAGES.contacts'),
  conversations: t('DATA_IMPORTS.MONITOR.STAGES.conversations'),
  finalizing: t('DATA_IMPORTS.MONITOR.STAGES.finalizing'),
  completed: t('DATA_IMPORTS.MONITOR.STAGES.completed'),
  completed_with_errors: t('DATA_IMPORTS.MONITOR.STAGES.completed_with_errors'),
  failed: t('DATA_IMPORTS.MONITOR.STAGES.failed'),
  abandoned: t('DATA_IMPORTS.MONITOR.STAGES.abandoned'),
}));

const monitorTitle = computed(
  () =>
    stageLabels.value[importStageKey(props.dataImport)] ||
    stageLabels.value.unknown
);

const statusDotClass = computed(() =>
  getStatusDotClass(props.dataImport?.status)
);

const hasActiveImport = computed(() => isActiveImport(props.dataImport));

const canAbandonImport = computed(() => isAbandonableImport(props.dataImport));
</script>

<template>
  <BaseSettingsHeader
    :title="title"
    :back-button-label="$t('DATA_IMPORTS.DETAIL.BACK')"
  >
    <template #title>
      <div class="flex w-full items-center justify-between gap-4">
        <h1 class="min-w-0 truncate text-heading-1 text-n-slate-12">
          {{ title }}
        </h1>
        <div class="flex shrink-0 items-center gap-2">
          <Button
            v-if="hasActiveImport"
            variant="outline"
            size="icon"
            :disabled="isRefreshing"
            :aria-label="$t('DATA_IMPORTS.MONITOR.REFRESH')"
            :title="$t('DATA_IMPORTS.MONITOR.REFRESH')"
            @click="$emit('refresh')"
          >
            <Spinner v-if="isRefreshing" class="size-4" />
            <Icon v-else icon="i-lucide-refresh-cw" />
          </Button>
          <Button
            v-if="dataImport?.stalled"
            variant="outline"
            size="sm"
            :disabled="isRetrying || isAbandoning"
            @click="$emit('retry')"
          >
            <Spinner v-if="isRetrying" class="size-4" />
            <Icon v-else icon="i-lucide-rotate-ccw" />
            {{ $t('DATA_IMPORTS.TABLE.RETRY') }}
          </Button>
          <Button
            v-if="canAbandonImport"
            variant="destructive"
            size="sm"
            :disabled="isAbandoning || isRetrying"
            @click="$emit('abandon')"
          >
            <Spinner v-if="isAbandoning" class="size-4" />
            {{ $t('DATA_IMPORTS.TABLE.ABANDON') }}
          </Button>
        </div>
      </div>
    </template>
    <template #description>
      <span class="inline-flex items-center gap-1.5 align-middle">
        <span
          class="size-2 rounded-full"
          :class="[statusDotClass, { 'animate-pulse': hasActiveImport }]"
        />
        {{ monitorTitle }}
      </span>
      <template v-if="hasActiveImport">
        <span
          class="mx-2 inline-block h-3 w-px rounded-lg bg-n-strong align-middle"
        />
        <span class="text-n-teal-11">
          {{
            isPolling
              ? $t('DATA_IMPORTS.MONITOR.REFRESHING')
              : $t('DATA_IMPORTS.MONITOR.LIVE', {
                  seconds: pollIntervalSeconds,
                })
          }}
        </span>
      </template>
    </template>
  </BaseSettingsHeader>
</template>
