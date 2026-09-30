<script setup lang="ts">
import { computed } from 'vue';
import { Field, FieldLabel, FieldError } from 'next/ui/field';
import { Textarea } from 'next/ui/textarea';

const props = withDefaults(
  defineProps<{
    label?: string;
    placeholder?: string;
    modelValue: string | number;
    error?: string;
  }>(),
  {
    label: '',
    placeholder: '',
    error: '',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
}>();

const computedModel = computed({
  get: () => props.modelValue,
  set: (value: string | number) => emit('update:modelValue', value),
});
</script>

<template>
  <Field :data-invalid="!!error">
    <FieldLabel v-if="label" class="text-xs font-medium">
      {{ label }}
    </FieldLabel>
    <Textarea
      v-model="computedModel"
      :placeholder="placeholder"
      class="min-h-32 resize-none"
      :aria-invalid="!!error"
    />
    <FieldError v-if="error">{{ error }}</FieldError>
  </Field>
</template>
