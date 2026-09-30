<script setup>
import { ref, onMounted } from 'vue';
import { getUnixStartOfDay, getUnixEndOfDay } from 'helpers/DateHelper';
import subDays from 'date-fns/subDays';
import WootDatePicker from 'dashboard/components/ui/DatePicker/DatePicker.vue';
import { Switch } from 'dashboard/components-next/ui/switch';
import {
  generateReportURLParams,
  parseReportURLParams,
  readURLQuery,
  replaceURLQuery,
} from '../helpers/reportFilterHelper';
import { DATE_RANGE_TYPES } from 'dashboard/components/ui/DatePicker/helpers/DatePickerHelper';

defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['filterChange']);

const customDateRange = ref([subDays(new Date(), 6), new Date()]);
const selectedDateRange = ref(DATE_RANGE_TYPES.LAST_7_DAYS);
const businessHoursSelected = ref(false);

const updateURLParams = () => {
  const params = generateReportURLParams({
    from: getUnixStartOfDay(customDateRange.value[0]),
    to: getUnixEndOfDay(customDateRange.value[1]),
    businessHours: businessHoursSelected.value,
    range: selectedDateRange.value,
  });

  replaceURLQuery({ ...params });
};

const emitChange = () => {
  updateURLParams();
  emit('filterChange', {
    from: getUnixStartOfDay(customDateRange.value[0]),
    to: getUnixEndOfDay(customDateRange.value[1]),
    businessHours: businessHoursSelected.value,
  });
};

const onDateRangeChange = value => {
  const [startDate, endDate, rangeType] = value;
  customDateRange.value = [startDate, endDate];
  selectedDateRange.value = rangeType || DATE_RANGE_TYPES.CUSTOM_RANGE;
  emitChange();
};

const onBusinessHoursToggle = () => {
  emitChange();
};

const initializeFromURL = () => {
  const urlParams = parseReportURLParams(readURLQuery());

  // Set the range type first
  if (urlParams.range) {
    selectedDateRange.value = urlParams.range;
  }

  // Restore dates from URL if available
  if (urlParams.from && urlParams.to) {
    customDateRange.value = [
      new Date(urlParams.from * 1000),
      new Date(urlParams.to * 1000),
    ];
  }

  if (urlParams.businessHours) {
    businessHoursSelected.value = urlParams.businessHours;
  }
};

onMounted(() => {
  initializeFromURL();
  emitChange();
});
</script>

<template>
  <div
    class="flex flex-col justify-between gap-3 md:flex-row"
    :class="{ 'pointer-events-none opacity-50': disabled }"
  >
    <div class="flex flex-col flex-wrap items-start gap-2 md:flex-row">
      <WootDatePicker
        v-model:date-range="customDateRange"
        v-model:range-type="selectedDateRange"
        @date-range-changed="onDateRangeChange"
      />
    </div>
    <div class="flex items-center">
      <span class="mx-2 text-sm whitespace-nowrap">
        {{ $t('REPORT.BUSINESS_HOURS') }}
      </span>
      <span>
        <Switch
          v-model="businessHoursSelected"
          @update:model-value="onBusinessHoursToggle"
        />
      </span>
    </div>
  </div>
</template>
