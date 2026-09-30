<script setup lang="ts">
import DatePicker, { type DateValue } from 'vue-datepicker-next';

withDefaults(
  defineProps<{
    confirmText?: string;
    placeholder?: string;
    value?: DateValue;
  }>(),
  {
    confirmText: '',
    placeholder: '',
    value: () => [],
  }
);

const emit = defineEmits<{
  (e: 'change', value: DateValue): void;
}>();

const handleChange = (value: DateValue) => {
  emit('change', value);
};
</script>

<template>
  <div class="date-picker">
    <DatePicker
      range
      confirm
      :clearable="false"
      :editable="false"
      :confirm-text="confirmText"
      :placeholder="placeholder"
      :value="value"
      @change="handleChange"
    />
  </div>
</template>
