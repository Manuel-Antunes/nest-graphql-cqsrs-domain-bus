<script setup lang="ts">
import type { CheckboxRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { Check } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import { CheckboxIndicator, CheckboxRoot, useForwardProps } from 'reka-ui';
import { cn } from 'next/lib/utils';

// reka-ui's CheckboxRoot is driven by `modelValue`/`update:modelValue`, but this
// codebase's convention is `checked`/`update:checked` (v-model:checked). Bridge
// the two here so every call site can use `:checked` / `v-model:checked`.
const props = defineProps<
  Omit<CheckboxRootProps, 'modelValue' | 'defaultValue'> & {
    checked?: boolean | 'indeterminate';
    class?: HTMLAttributes['class'];
  }
>();

const emits = defineEmits<{
  (e: 'update:checked', value: boolean | 'indeterminate'): void;
}>();

const forwarded = useForwardProps(reactiveOmit(props, 'class', 'checked'));

const modelValue = computed({
  get: () => props.checked ?? false,
  set: value => emits('update:checked', value),
});
</script>

<template>
  <CheckboxRoot
    v-slot="slotProps"
    v-bind="forwarded"
    v-model="modelValue"
    data-slot="checkbox"
    :class="
      cn(
        'peer p-0 border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-sm transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  >
    <CheckboxIndicator
      data-slot="checkbox-indicator"
      class="grid place-content-center text-current transition-none"
    >
      <slot v-bind="slotProps">
        <Check class="size-3.5" />
      </slot>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
