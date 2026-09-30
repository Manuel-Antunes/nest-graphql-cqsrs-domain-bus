<script setup>
import { onMounted, ref, computed, watch } from 'vue';
import MetricCard from '../overview/MetricCard.vue';
import BaseHeatmap from './BaseHeatmap.vue';
import HeatmapDateRangeSelector from './HeatmapDateRangeSelector.vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useLiveRefresh } from 'dashboard/composables/useLiveRefresh';
import differenceInCalendarDays from 'date-fns/differenceInCalendarDays';
import endOfDay from 'date-fns/endOfDay';
import format from 'date-fns/format';
import getUnixTime from 'date-fns/getUnixTime';
import startOfDay from 'date-fns/startOfDay';
import startOfMonth from 'date-fns/startOfMonth';
import subDays from 'date-fns/subDays';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import { useI18n } from 'vue-i18n';
import { downloadCsvFile } from 'dashboard/helper/downloadHelper';

const props = defineProps({
  metric: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  downloadTitle: {
    type: String,
    required: true,
  },
  storeGetter: {
    type: String,
    required: true,
  },
  storeAction: {
    type: String,
    required: true,
  },
  downloadAction: {
    type: String,
    default: '',
  },
  uiFlagKey: {
    type: String,
    required: true,
  },
  colorScheme: {
    type: String,
    default: 'blue',
  },
});

const store = useStore();
const { t } = useI18n();

const uiFlags = useMapGetter('getOverviewUIFlags');
const heatmapData = useMapGetter(props.storeGetter);
const inboxes = useMapGetter('inboxes/getInboxes');

const selectedFrom = ref(null);
const selectedTo = ref(null);
const selectedDaysBefore = ref(null);
const selectedInbox = ref(null);
const isMonthFilter = ref(false);
const currentMonthOffset = ref(0);
const inboxSearchQuery = ref('');

const selectedRange = computed(() => {
  if (!selectedFrom.value || !selectedTo.value) {
    return null;
  }
  return {
    from: selectedFrom.value,
    to: selectedTo.value,
  };
});

const numberOfRows = computed(() => {
  if (!selectedRange.value) {
    return 0;
  }
  const dateDifference = differenceInCalendarDays(
    selectedRange.value.to,
    selectedRange.value.from
  );
  return dateDifference + 1;
});

const inboxMenuItems = computed(() => {
  return [
    {
      label: t('INBOX_REPORTS.ALL_INBOXES'),
      value: null,
    },
    ...inboxes.value.map(inbox => ({
      label: inbox.name,
      value: inbox.id,
    })),
  ];
});

const filteredInboxMenuItems = computed(() => {
  if (!inboxSearchQuery.value) return inboxMenuItems.value;
  return inboxMenuItems.value.filter(item =>
    item.label.toLowerCase().includes(inboxSearchQuery.value.toLowerCase())
  );
});

const selectedInboxFilter = computed(() => {
  if (!selectedInbox.value) {
    return { label: t('INBOX_REPORTS.ALL_INBOXES') };
  }
  return inboxMenuItems.value.find(
    item => item.value === selectedInbox.value.id
  );
});

const isLoading = computed(() => uiFlags.value[props.uiFlagKey]);
const isResolutionHeatmap = computed(
  () => props.metric === 'resolutions_count'
);
const heatmapAriaLabel = computed(() =>
  t('OVERVIEW_REPORTS.HEATMAP_ARIA_LABEL', { metric: props.title })
);

const formatHeatmapValue = value => {
  if (isResolutionHeatmap.value) {
    if (!value) {
      return t('OVERVIEW_REPORTS.RESOLUTION_HEATMAP.NO_CONVERSATIONS');
    }
    return value === 1
      ? t('OVERVIEW_REPORTS.RESOLUTION_HEATMAP.CONVERSATION', { count: value })
      : t('OVERVIEW_REPORTS.RESOLUTION_HEATMAP.CONVERSATIONS', {
          count: value,
        });
  }

  if (!value) {
    return t('OVERVIEW_REPORTS.CONVERSATION_HEATMAP.NO_CONVERSATIONS');
  }
  return value === 1
    ? t('OVERVIEW_REPORTS.CONVERSATION_HEATMAP.CONVERSATION', { count: value })
    : t('OVERVIEW_REPORTS.CONVERSATION_HEATMAP.CONVERSATIONS', {
        count: value,
      });
};

// Keeps relative presets (last 7 days / this month) aligned with "now" during live refreshes.
const resolveActiveRange = () => {
  if (isMonthFilter.value && currentMonthOffset.value === 0) {
    const now = new Date();
    const monthStart = startOfMonth(now);
    return {
      from: startOfDay(monthStart),
      to: endOfDay(now),
    };
  }

  if (!isMonthFilter.value && selectedDaysBefore.value !== null) {
    const to = endOfDay(new Date());
    return {
      from: startOfDay(subDays(to, Number(selectedDaysBefore.value))),
      to,
    };
  }

  return selectedRange.value;
};

const downloadHeatmapData = () => {
  const range = resolveActiveRange();
  if (!range) {
    return;
  }

  const { to } = range;
  const shouldUseBackendDownload =
    !isMonthFilter.value && !selectedInbox.value && props.downloadAction;

  // If no inbox is selected and download action exists, use backend endpoint
  if (shouldUseBackendDownload) {
    store.dispatch(props.downloadAction, {
      daysBefore: selectedDaysBefore.value,
      to: getUnixTime(to),
    });
    return;
  }

  // Generate CSV from store data
  if (!heatmapData.value || heatmapData.value.length === 0) {
    return;
  }

  // Create CSV headers
  const headers = ['Date', 'Hour', props.title];
  const rows = [headers];

  // Convert heatmap data to rows
  heatmapData.value.forEach(item => {
    const date = new Date(item.timestamp * 1000);
    const dateStr = format(date, 'yyyy-MM-dd');
    const hour = date.getHours();
    rows.push([dateStr, `${hour}:00 - ${hour + 1}:00`, item.value]);
  });

  // Convert to CSV string
  const csvContent = rows.map(row => row.join(',')).join('\n');

  // Generate filename
  const inboxName = selectedInbox.value
    ? `_${selectedInbox.value.name.replace(/[^a-z0-9]/gi, '_')}`
    : '';
  const fileName = `${props.downloadTitle}${inboxName}_${format(
    new Date(),
    'dd-MM-yyyy'
  )}.csv`;

  // Download the file
  downloadCsvFile(fileName, csvContent);
};

const fetchHeatmapData = () => {
  if (isLoading.value) {
    return;
  }

  const range = resolveActiveRange();
  if (!range) {
    return;
  }

  const { from, to } = range;

  const params = {
    metric: props.metric,
    from: getUnixTime(from),
    to: getUnixTime(to),
    groupBy: 'hour',
    businessHours: false,
  };

  // Add inbox filtering if an inbox is selected
  if (selectedInbox.value) {
    params.type = 'inbox';
    params.id = selectedInbox.value.id;
  }

  store.dispatch(props.storeAction, params);
};

const handleInboxAction = item => {
  selectedInbox.value = item.value
    ? inboxes.value.find(inbox => inbox.id === item.value)
    : null;
};

const { startRefetching } = useLiveRefresh(fetchHeatmapData);

const handleRangeTypeChange = type => {
  isMonthFilter.value = type === 'month';
};

const handleMonthOffsetChange = offset => {
  currentMonthOffset.value = offset;
};

watch(
  () => [selectedFrom.value, selectedTo.value],
  ([from, to]) => {
    if (from && to) {
      fetchHeatmapData();
    }
  }
);

watch(
  () => selectedInbox.value,
  () => {
    if (selectedRange.value) {
      fetchHeatmapData();
    }
  }
);

onMounted(() => {
  store.dispatch('inboxes/get');
  startRefetching();
});
</script>

<template>
  <div class="flex flex-row flex-wrap max-w-full">
    <MetricCard :header="title">
      <template #control>
        <HeatmapDateRangeSelector
          v-model:from="selectedFrom"
          v-model:to="selectedTo"
          v-model:days-num="selectedDaysBefore"
          @range-type-change="handleRangeTypeChange"
          @month-offset-change="handleMonthOffsetChange"
        />
        <DropdownMenu
          @update:open="
            val => {
              if (val) inboxSearchQuery = '';
            }
          "
        >
          <DropdownMenuTrigger as-child>
            <Button variant="outline">
              {{ selectedInboxFilter.label }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            class="min-w-56 max-h-96 overflow-y-auto"
          >
            <div class="sticky top-0 bg-n-alpha-3 backdrop-blur-sm mb-1">
              <InputGroup>
                <InputGroupAddon>
                  <span class="i-lucide-search size-4 text-muted-foreground" />
                </InputGroupAddon>
                <InputGroupInput
                  v-model="inboxSearchQuery"
                  type="search"
                  :placeholder="t('INBOX_REPORTS.SEARCH_INBOX')"
                />
              </InputGroup>
            </div>
            <DropdownMenuItem
              v-for="item in filteredInboxMenuItems"
              :key="item.value ?? 'all'"
              :class="
                item.value === selectedInbox?.id
                  ? 'bg-n-alpha-1 dark:bg-n-solid-active'
                  : ''
              "
              @select="handleInboxAction(item)"
            >
              {{ item.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          v-tooltip="t('OVERVIEW_REPORTS.CONVERSATION_HEATMAP.DOWNLOAD_REPORT')"
          variant="outline"
          size="icon"
          @click="downloadHeatmapData"
        >
          <Icon icon="i-lucide-download" />
        </Button>
      </template>
      <BaseHeatmap
        :heatmap-data="heatmapData"
        :number-of-rows="numberOfRows"
        :is-loading="isLoading"
        :color-scheme="colorScheme"
        :aria-label="heatmapAriaLabel"
        :format-value="formatHeatmapValue"
      />
    </MetricCard>
  </div>
</template>
