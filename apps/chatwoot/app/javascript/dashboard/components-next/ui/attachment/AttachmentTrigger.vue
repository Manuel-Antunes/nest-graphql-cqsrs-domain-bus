<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'vue';
import { computed, useAttrs } from 'vue';
import { Primitive } from 'reka-ui';
import { cn } from 'next/lib/utils';

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    as: 'button',
  }
);

// Mirror Button.vue: default native <button> to type="button" so it never
// accidentally submits a surrounding form. Non-button `as` gets no type.
const attrs = useAttrs();
const resolvedType = computed(() =>
  !props.asChild && props.as === 'button'
    ? ((attrs.type as ButtonHTMLAttributes['type']) ?? 'button')
    : undefined
);
</script>

<template>
  <Primitive
    data-slot="attachment-trigger"
    :as="as"
    :as-child="asChild"
    :type="resolvedType"
    :class="cn('absolute inset-0 z-10 outline-none', props.class)"
  >
    <slot />
  </Primitive>
</template>
