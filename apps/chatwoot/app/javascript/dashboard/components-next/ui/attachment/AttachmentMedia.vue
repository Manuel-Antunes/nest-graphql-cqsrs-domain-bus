<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { AttachmentMediaVariants } from '.';
import { cn } from 'next/lib/utils';
import { attachmentMediaVariants } from '.';

const props = withDefaults(
  defineProps<{
    variant?: AttachmentMediaVariants['variant'];
    class?: HTMLAttributes['class'];
  }>(),
  {
    variant: 'icon',
  }
);
</script>

<template>
  <div
    data-slot="attachment-media"
    :data-variant="variant"
    :class="cn(attachmentMediaVariants({ variant }), props.class)"
  >
    <slot />
  </div>
</template>
