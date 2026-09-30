<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'next/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <div
    data-slot="message-header"
    :class="
      cn(
        'flex max-w-full min-w-0 items-center px-3 text-xs font-medium text-muted-foreground group-has-data-[variant=ghost]/message:px-0',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
