<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { BubbleVariants } from '.';
import { cn } from 'next/lib/utils';
import { bubbleVariants } from '.';

const props = withDefaults(
  defineProps<{
    variant?: BubbleVariants['variant'];
    align?: 'start' | 'end';
    class?: HTMLAttributes['class'];
  }>(),
  {
    variant: 'default',
    align: 'start',
  }
);
</script>

<template>
  <div
    data-slot="bubble"
    :data-variant="variant"
    :data-align="align"
    :class="cn(bubbleVariants({ variant }), props.class)"
  >
    <slot />
  </div>
</template>
