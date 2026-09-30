<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'vue';
import type { ButtonVariants } from '.';
import { computed, useAttrs } from 'vue';
import { Primitive } from 'reka-ui';
import { buttonVariants } from '.';
import { cn } from 'next/lib/utils';

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
});

// Default native <button> elements to type="button" so they never accidentally
// submit (and close) a surrounding <form>/dialog. Submit buttons opt in via
// an explicit type="submit". Non-button `as` (e.g. RouterLink) gets no type.
const attrs = useAttrs();
const resolvedType = computed(() =>
  !props.asChild && props.as === 'button'
    ? ((attrs.type as ButtonHTMLAttributes['type']) ?? 'button')
    : undefined
);
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :type="resolvedType"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
