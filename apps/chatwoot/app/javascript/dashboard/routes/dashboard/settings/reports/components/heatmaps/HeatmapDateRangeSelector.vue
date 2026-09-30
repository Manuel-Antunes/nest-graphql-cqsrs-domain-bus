<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import addMonths from 'date-fns/addMonths';
import differenceInCalendarDays from 'date-fns/differenceInCalendarDays';
import endOfDay from 'date-fns/endOfDay';
import endOfMonth from 'date-fns/endOfMonth';
import startOfDay from 'date-fns/startOfDay';
import startOfMonth from 'date-fns/startOfMonth';
import subDays from 'date-fns/subDays';
import { Button } from 'dashboard/components-next/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';

const emit = defineEmits(['rangeTypeChange', 'monthOffsetChange']);

const fromModel = defineModel('from', { type: Date, default: null });
const toModel = defineModel('to', { type: Date, default: null });
const daysNumModel = defineModel('daysNum', { type: Number, default: null });

const { t, locale } = useI18n();

const DATE_FILTER_TYPES = {
  DAY: 'day',
  MONTH: 'month',
};

const DATE_FILTER_ACTION = 'select_date_range';

const dayMenuItemConfigs = computed(() => [
  {
    label: t('REPORT.DATE_RANGE_OPTIONS.LAST_7_DAYS'),
    value: 'last_7_days',
    action: DATE_FILTER_ACTION,
    type: DATE_FILTER_TYPES.DAY,
    daysBefore: 6,
  },
  {
    label: t('REPORT.DATE_RANGE_OPTIONS.LAST_14_DAYS'),
    value: 'last_14_days',
    action: DATE_FILTER_ACTION,
    type: DATE_FILTER_TYPES.DAY,
    daysBefore: 13,
  },
  {
    label: t('REPORT.DATE_RANGE_OPTIONS.LAST_30_DAYS'),
    value: 'last_30_days',
    action: DATE_FILTER_ACTION,
    type: DATE_FILTER_TYPES.DAY,
    daysBefore: 29,
  },
]);

const resolvedLocale = computed(() => {
  const currentLocale =
    locale.value ||
    (typeof navigator !== 'undefined' ? navigator.language : 'en');
  return currentLocale.replace('_', '-');
});

const monthFormatter = computed(
  () =>
    new Intl.DateTimeFormat(resolvedLocale.value, {
      month: 'long',
      year: 'numeric',
    })
);

const monthMenuItemConfigs = computed(() => {
  const now = new Date();
  const offsets = [0, -1, -2];

  return offsets.map(offset => ({
    label:
      offset === 0
        ? t('REPORT.DATE_RANGE_OPTIONS.THIS_MONTH')
        : monthFormatter.value.format(addMonths(now, offset)),
    value: offset === 0 ? 'this_month' : `month_${offset}`,
    action: DATE_FILTER_ACTION,
    type: DATE_FILTER_TYPES.MONTH,
    monthOffset: offset,
  }));
});

const selectedDateRangeValue = ref('');

const monthOffset = ref(0);

const menuItems = computed(() => {
  const selectedValue = selectedDateRangeValue.value;
  return [...dayMenuItemConfigs.value, ...monthMenuItemConfigs.value].map(
    config => ({
      ...config,
      isSelected: selectedValue === config.value,
    })
  );
});

selectedDateRangeValue.value = menuItems.value[0]?.value || '';

const menuSections = computed(() => {
  const dayItems = menuItems.value.filter(
    item => item.type === DATE_FILTER_TYPES.DAY
  );
  const monthItems = menuItems.value.filter(
    item => item.type === DATE_FILTER_TYPES.MONTH
  );

  return [{ items: dayItems }, { items: monthItems }].filter(
    section => section.items.length > 0
  );
});

const selectedConfig = computed(
  () =>
    menuItems.value.find(
      menuItem => menuItem.value === selectedDateRangeValue.value
    ) || menuItems.value[0]
);

const selectedLabel = computed(() => {
  const selectedItem = menuItems.value.find(
    item => item.value === selectedDateRangeValue.value
  );
  return selectedItem?.label || '';
});

const computeRange = config => {
  if (!config) {
    return null;
  }

  if (config.type === DATE_FILTER_TYPES.MONTH) {
    const now = new Date();
    const baseMonthStart = startOfMonth(addMonths(now, monthOffset.value));
    const from = startOfDay(baseMonthStart);
    const isCurrentMonth =
      config.value === 'this_month' && monthOffset.value === 0;
    const to = isCurrentMonth
      ? endOfDay(now)
      : endOfDay(endOfMonth(baseMonthStart));
    const daysBefore = differenceInCalendarDays(to, from);
    return { from, to, daysBefore };
  }

  const to = endOfDay(new Date());
  const from = startOfDay(subDays(to, Number(config.daysBefore)));
  return { from, to, daysBefore: Number(config.daysBefore) };
};

const applySelection = config => {
  if (!config) return;

  if (config.type === DATE_FILTER_TYPES.MONTH) {
    monthOffset.value = config.monthOffset || 0;
  } else {
    monthOffset.value = 0;
  }

  const range = computeRange(config);
  if (!range) return;

  const { from, to, daysBefore } = range;
  fromModel.value = from;
  toModel.value = to;
  daysNumModel.value = daysBefore;

  emit('rangeTypeChange', config.type);
  emit('monthOffsetChange', monthOffset.value);
};

const handleAction = item => {
  if (item.action !== DATE_FILTER_ACTION) return;
  selectedDateRangeValue.value = item.value;
};

watch(
  () => selectedConfig.value,
  config => {
    applySelection(config);
  },
  { immediate: true }
);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline">{{ selectedLabel }}</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <template v-for="(section, sIndex) in menuSections" :key="sIndex">
        <DropdownMenuSeparator v-if="sIndex > 0" />
        <DropdownMenuItem
          v-for="item in section.items"
          :key="item.value"
          :class="item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''"
          @select="handleAction(item)"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
