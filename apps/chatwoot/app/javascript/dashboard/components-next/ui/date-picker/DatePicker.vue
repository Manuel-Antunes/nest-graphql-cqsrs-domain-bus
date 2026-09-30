<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed, ref, watch } from 'vue';
import type { DateValue } from '@internationalized/date';
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { CalendarIcon } from '@lucide/vue';
import { cn } from 'next/lib/utils';
import { Button } from '../button';
import { Calendar } from '../calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';

const props = withDefaults(
  defineProps<{
    /** ISO date string (`yyyy-MM-dd`). Empty/undefined means no selection. */
    modelValue?: string | null;
    /** Lower bound as `yyyy-MM-dd`. */
    min?: string | null;
    /** Upper bound as `yyyy-MM-dd`. */
    max?: string | null;
    placeholder?: string;
    disabled?: boolean;
    /** Locale for the displayed label and calendar (defaults to pt-BR). */
    locale?: string;
    class?: HTMLAttributes['class'];
  }>(),
  {
    modelValue: '',
    placeholder: 'Selecione uma data',
  }
);

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const open = ref(false);

const resolvedLocale = computed(
  () =>
    props.locale ||
    (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR')
);

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const toDateValue = (value?: string | null): DateValue | undefined => {
  if (!value) return undefined;
  try {
    // Tolerate full ISO timestamps by keeping only the date part.
    return parseDate(value.slice(0, 10));
  } catch {
    return undefined;
  }
};

// Drives the month currently shown in the calendar; kept in sync with the
// month/year dropdowns and the calendar's own prev/next navigation.
const placeholderDate = ref<DateValue>(
  toDateValue(props.modelValue) ?? today(getLocalTimeZone())
);

watch(
  () => props.modelValue,
  value => {
    const parsed = toDateValue(value);
    if (parsed) placeholderDate.value = parsed;
  }
);

const dateValue = computed<DateValue | undefined>({
  get: () => toDateValue(props.modelValue),
  set: value => {
    emits('update:modelValue', value ? value.toString() : '');
    if (value) {
      placeholderDate.value = value;
      open.value = false;
    }
  },
});

const minValue = computed(() => toDateValue(props.min));
const maxValue = computed(() => toDateValue(props.max));

const monthNames = computed(() => {
  const formatter = new Intl.DateTimeFormat(resolvedLocale.value, {
    month: 'long',
  });
  return Array.from({ length: 12 }, (_, i) =>
    capitalize(formatter.format(new Date(2020, i, 1)))
  );
});

const years = computed(() => {
  const current = new Date().getFullYear();
  return Array.from({ length: 100 }, (_, i) => current - 50 + i);
});

const selectedMonth = computed<string>({
  get: () => monthNames.value[placeholderDate.value.month - 1],
  set: name => {
    const index = monthNames.value.indexOf(name);
    if (index >= 0) {
      placeholderDate.value = placeholderDate.value.set({ month: index + 1 });
    }
  },
});

const selectedYear = computed<string>({
  get: () => String(placeholderDate.value.year),
  set: value => {
    placeholderDate.value = placeholderDate.value.set({ year: Number(value) });
  },
});

const label = computed(() => {
  const value = dateValue.value;
  if (!value) return props.placeholder;
  const jsDate = value.toDate(getLocalTimeZone());
  const day = String(value.day).padStart(2, '0');
  const month = capitalize(
    new Intl.DateTimeFormat(resolvedLocale.value, { month: 'short' }).format(
      jsDate
    )
  );
  return `${day} ${month}, ${value.year}`;
});
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :disabled="disabled"
        :class="
          cn(
            'w-full justify-start text-left font-normal',
            !dateValue && 'text-muted-foreground',
            props.class
          )
        "
      >
        <CalendarIcon class="mr-2 size-4 shrink-0" />
        <span class="truncate">{{ label }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <div class="border-b p-3">
        <div class="flex items-center justify-between gap-2">
          <Select v-model="selectedMonth">
            <SelectTrigger class="max-w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="monthName in monthNames"
                :key="monthName"
                :value="monthName"
              >
                {{ monthName }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="selectedYear">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="year in years"
                :key="year"
                :value="String(year)"
              >
                {{ year }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Calendar
        v-model="dateValue"
        v-model:placeholder="placeholderDate"
        :min-value="minValue"
        :max-value="maxValue"
        :locale="resolvedLocale"
        initial-focus
      />
    </PopoverContent>
  </Popover>
</template>
