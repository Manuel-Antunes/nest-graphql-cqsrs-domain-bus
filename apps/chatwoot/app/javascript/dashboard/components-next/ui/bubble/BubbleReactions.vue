<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { BubbleReactionsVariants } from '.';
import { cn } from 'next/lib/utils';
import { bubbleReactionsVariants } from '.';

const props = withDefaults(
  defineProps<{
    side?: BubbleReactionsVariants['side'];
    align?: BubbleReactionsVariants['align'];
    class?: HTMLAttributes['class'];
  }>(),
  {
    side: 'bottom',
    align: 'end',
  }
);
</script>

<template>
  <div
    data-slot="bubble-reactions"
    :data-align="align"
    :data-side="side"
    :class="cn(bubbleReactionsVariants({ side, align }), props.class)"
  >
    <slot />
  </div>
</template>
