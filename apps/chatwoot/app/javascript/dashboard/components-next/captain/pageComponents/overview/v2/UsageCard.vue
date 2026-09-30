<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import OverviewPanel from './OverviewPanel.vue';
import ProgressMetric from './ProgressMetric.vue';

const props = defineProps({
  responseLimits: { type: Object, default: null },
  documentLimits: { type: Object, default: null },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['refresh', 'buy']);
const { t } = useI18n();
const { isOnChatwootCloud } = useAccount();
const { isAdmin } = useAdmin();

const canBuyCredits = computed(() => isOnChatwootCloud.value && isAdmin.value);

const percentage = limits => {
  const total = Number(limits?.totalCount || 0);
  return total ? (Number(limits?.consumed || 0) / total) * 100 : 0;
};

const formatPercentage = value =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

const valueLabel = limits =>
  t('CAPTAIN.OVERVIEW.V2.USAGE.VALUE', {
    used: Number(limits?.consumed || 0).toLocaleString(),
    total: Number(limits?.totalCount || 0).toLocaleString(),
  });

const meters = computed(() => [
  {
    key: 'responses',
    label: t('CAPTAIN.OVERVIEW.V2.USAGE.CREDITS'),
    used: Number(props.responseLimits?.consumed || 0),
    total: Number(props.responseLimits?.totalCount || 0),
    usageLabel: t('CAPTAIN.OVERVIEW.V2.USAGE.USED', {
      percentage: formatPercentage(percentage(props.responseLimits)),
    }),
    valueLabel: valueLabel(props.responseLimits),
    color: 'rgb(var(--blue-9))',
  },
  {
    key: 'documents',
    label: t('CAPTAIN.OVERVIEW.V2.USAGE.DOCUMENTS'),
    used: Number(props.documentLimits?.consumed || 0),
    total: Number(props.documentLimits?.totalCount || 0),
    usageLabel: t('CAPTAIN.OVERVIEW.V2.USAGE.USED', {
      percentage: formatPercentage(percentage(props.documentLimits)),
    }),
    valueLabel: valueLabel(props.documentLimits),
    color: 'rgb(var(--blue-9))',
  },
]);
</script>

<template>
  <OverviewPanel :title="$t('CAPTAIN.OVERVIEW.V2.USAGE.TITLE')">
    <template #actions>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          :aria-label="$t('CAPTAIN.OVERVIEW.V2.USAGE.REFRESH')"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <Spinner v-if="loading" class="size-4" />
          <Icon v-else icon="i-lucide-refresh-cw" class="size-4" />
        </Button>
        <Button
          v-if="canBuyCredits"
          variant="outline"
          size="sm"
          @click="emit('buy')"
        >
          {{ $t('CAPTAIN.OVERVIEW.V2.USAGE.BUY_MORE') }}
        </Button>
      </div>
    </template>
    <div class="flex flex-col gap-5 p-5">
      <ProgressMetric
        v-for="meter in meters"
        :key="meter.key"
        v-bind="meter"
        :loading="loading"
      />
    </div>
  </OverviewPanel>
</template>
