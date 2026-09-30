<script setup lang="ts">
/**
 * @deprecated This component is deprecated and will be removed in the next major version.
 * Please use v3/components/Form/Input.vue instead
 */
import { onMounted } from 'vue';
import type { StyleValue } from 'vue';
import { Field, FieldLabel, FieldError, FieldDescription } from 'next/ui/field';
import { Input } from 'next/ui/input';

withDefaults(
  defineProps<{
    label?: string;
    modelValue?: string | number;
    type?: string;
    placeholder?: string;
    helpText?: string;
    error?: string;
    readonly?: boolean;
    styles?: StyleValue;
  }>(),
  {
    label: '',
    modelValue: '',
    type: 'text',
    placeholder: '',
    helpText: '',
    error: '',
    readonly: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
  (e: 'input', value: string | number): void;
  (e: 'blur', value: string): void;
}>();

const onChange = (value: string | number) => {
  emit('input', value);
  emit('update:modelValue', value);
};

const onBlur = (e: Event) => {
  emit('blur', (e.target as HTMLInputElement).value);
};

onMounted(() => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      '[DEPRECATED] <WootInput> has be deprecated and will be removed soon. Please use v3/components/Form/Input.vue instead'
    );
  }
});
</script>

<template>
  <Field :data-invalid="!!error" class="gap-1.5">
    <FieldLabel v-if="label" class="text-sm font-medium">
      {{ label }}
    </FieldLabel>
    <Input
      :model-value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :readonly="readonly"
      :style="styles"
      :aria-invalid="error ? true : undefined"
      @update:model-value="onChange"
      @blur="onBlur"
    />
    <FieldError v-if="error">{{ error }}</FieldError>
    <FieldDescription v-if="helpText">{{ helpText }}</FieldDescription>
    <slot name="masked" />
  </Field>
</template>
