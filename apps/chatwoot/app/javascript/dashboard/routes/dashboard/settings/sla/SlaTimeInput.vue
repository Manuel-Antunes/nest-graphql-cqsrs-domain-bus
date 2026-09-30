<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

const props = defineProps({
  threshold: {
    type: Number,
    default: null,
  },
  thresholdUnit: {
    type: String,
    default: 'Minutes',
  },
  label: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['unit', 'isInValid', 'updateThreshold']);

const { t } = useI18n();

const thresholdTime = ref(props.threshold || '');
const thresholdUnitValue = ref(props.thresholdUnit);
const isTouched = ref(false);

const options = [
  { value: 'Minutes', label: 'minutes' },
  { value: 'Hours', label: 'hours' },
  { value: 'Days', label: 'days' },
];

// Mirror the previous vuelidate rules: { decimal, minValue: 0.001 }. Empty is
// allowed (the field is optional); a present value must be numeric and >= 0.001.
const isThresholdValid = value => {
  if (value === '' || value === null || value === undefined) return true;
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= 0.001;
};

const thresholdTimeErrorMessage = computed(() =>
  isTouched.value && !isThresholdValid(thresholdTime.value)
    ? t('SLA.FORM.THRESHOLD_TIME.INVALID_FORMAT_ERROR')
    : ''
);

watch(
  () => props.threshold,
  value => {
    if (!Number.isNaN(value)) {
      thresholdTime.value = value;
    }
  },
  { immediate: true }
);

watch(
  () => props.thresholdUnit,
  value => {
    thresholdUnitValue.value = value;
  },
  { immediate: true }
);

const onThresholdUnitChange = () => {
  emit('unit', thresholdUnitValue.value);
};

const onThresholdTimeChange = () => {
  isTouched.value = true;
  emit('isInValid', !isThresholdValid(thresholdTime.value));
  emit(
    'updateThreshold',
    thresholdTime.value ? Number(thresholdTime.value) : null
  );
};
</script>

<template>
  <div class="flex items-center w-full gap-3">
    <div class="flex flex-col flex-grow gap-1">
      <Label>{{ label }}</Label>
      <Input
        v-model="thresholdTime"
        type="number"
        :aria-invalid="!!thresholdTimeErrorMessage || undefined"
        :placeholder="placeholder"
        @update:model-value="onThresholdTimeChange"
      />
      <p v-if="thresholdTimeErrorMessage" class="text-sm text-n-ruby-9">
        {{ thresholdTimeErrorMessage }}
      </p>
    </div>
    <!-- the mt-7 handles the label offset -->
    <div class="mt-7">
      <Select
        v-model="thresholdUnitValue"
        @update:model-value="onThresholdUnitChange"
      >
        <SelectTrigger class="min-w-[6.5rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="(option, index) in options"
            :key="index"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
