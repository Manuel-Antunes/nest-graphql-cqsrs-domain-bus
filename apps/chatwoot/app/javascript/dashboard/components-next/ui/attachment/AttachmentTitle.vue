<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from 'next/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <span
    data-slot="attachment-title"
    :class="
      cn(
        'block max-w-full min-w-0 truncate font-medium group-data-[state=processing]/attachment:shimmer group-data-[state=uploading]/attachment:shimmer',
        props.class
      )
    "
  >
    <slot />
  </span>
</template>
