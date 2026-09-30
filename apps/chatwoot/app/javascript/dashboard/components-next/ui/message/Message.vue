<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'next/lib/utils';

const props = withDefaults(
  defineProps<{
    align?: 'start' | 'end';
    class?: HTMLAttributes['class'];
  }>(),
  {
    align: 'start',
  }
);
</script>

<template>
  <div
    data-slot="message"
    :data-align="align"
    :class="
      cn(
        'group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
