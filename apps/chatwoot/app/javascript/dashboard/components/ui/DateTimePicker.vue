<script setup lang="ts">
import addDays from 'date-fns/addDays';
import DatePicker from 'vue-datepicker-next';

withDefaults(
  defineProps<{
    confirmText?: string;
    placeholder?: string;
    value?: Date;
  }>(),
  {
    confirmText: '',
    placeholder: '',
  }
);

const emit = defineEmits<{
  (e: 'change', value: Date): void;
}>();

const handleChange = (value: Date) => {
  emit('change', value);
};

const disableBeforeToday = (date: Date) => {
  const yesterdayDate = addDays(new Date(), -1);
  return date < yesterdayDate;
};
</script>

<template>
  <div class="date-picker">
    <DatePicker
      type="datetime"
      confirm
      :clearable="false"
      :editable="false"
      :confirm-text="confirmText"
      :placeholder="placeholder"
      :value="value"
      :disabled-date="disableBeforeToday"
      @change="handleChange"
    />
  </div>
</template>
