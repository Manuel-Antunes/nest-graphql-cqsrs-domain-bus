<script setup>
import { ref, computed, onMounted } from 'vue';
import SLAFilter from '../SLA/SLAFilter.vue';
import WootDatePicker from 'dashboard/components/ui/DatePicker/DatePicker.vue';
import { subDays, fromUnixTime } from 'date-fns';
import { getUnixStartOfDay, getUnixEndOfDay } from 'helpers/DateHelper';
import {
  generateReportURLParams,
  parseReportURLParams,
  parseFilterURLParams,
  readURLQuery,
  replaceURLQuery,
} from '../../helpers/reportFilterHelper';

const emit = defineEmits(['filterChange']);

// Initialize from URL params immediately
const urlParams = parseReportURLParams(readURLQuery());
const initialDateRange =
  urlParams.from && urlParams.to
    ? [fromUnixTime(urlParams.from), fromUnixTime(urlParams.to)]
    : [subDays(new Date(), 6), new Date()];

const selectedDateRange = ref(urlParams.range || 'last7days');
const selectedGroupByFilter = ref(null);
const customDateRange = ref(initialDateRange);

const to = computed(() => getUnixEndOfDay(customDateRange.value[1]));
const from = computed(() => getUnixStartOfDay(customDateRange.value[0]));

const updateURLParams = () => {
  const dateParams = generateReportURLParams({
    from: from.value,
    to: to.value,
    range: selectedDateRange.value,
  });

  const filterParams = parseFilterURLParams(readURLQuery());
  const params = { ...dateParams };

  if (filterParams.agent_id) params.agent_id = filterParams.agent_id;
  if (filterParams.inbox_id) params.inbox_id = filterParams.inbox_id;
  if (filterParams.team_id) params.team_id = filterParams.team_id;
  if (filterParams.sla_policy_id)
    params.sla_policy_id = filterParams.sla_policy_id;
  if (filterParams.label) params.label = filterParams.label;

  replaceURLQuery(params);
};

const emitChange = () => {
  updateURLParams();
  emit('filterChange', {
    from: from.value,
    to: to.value,
    ...selectedGroupByFilter.value,
  });
};

const emitFilterChange = params => {
  selectedGroupByFilter.value = params;
  emit('filterChange', {
    from: from.value,
    to: to.value,
    ...selectedGroupByFilter.value,
  });
};

const onDateRangeChange = ([startDate, endDate, rangeType]) => {
  customDateRange.value = [startDate, endDate];
  selectedDateRange.value = rangeType;
  emitChange();
};

const setInitialRange = () => {
  customDateRange.value = [subDays(new Date(), 6), new Date()];
  emitChange();
};

onMounted(() => {
  const query = readURLQuery();
  if (!query.from || !query.to) {
    setInitialRange();
  }
});
</script>

<template>
  <div class="flex flex-col flex-wrap w-full gap-3 md:flex-row">
    <WootDatePicker
      v-model:date-range="customDateRange"
      v-model:range-type="selectedDateRange"
      @date-range-changed="onDateRangeChange"
    />
    <SLAFilter @filter-change="emitFilterChange" />
  </div>
</template>
