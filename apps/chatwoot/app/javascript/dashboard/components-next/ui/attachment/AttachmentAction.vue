<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { ButtonVariants } from 'next/ui/button';
import { Button } from 'next/ui/button';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant'];
    size?: ButtonVariants['size'];
    class?: HTMLAttributes['class'];
  }>(),
  {
    variant: 'ghost',
    size: 'icon-xs',
  }
);
</script>

<template>
  <Button
    data-slot="attachment-action"
    :variant="variant"
    :size="size"
    :class="props.class"
  >
    <slot />
  </Button>
</template>
