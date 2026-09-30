<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DialogClose } from 'reka-ui';
import { Button } from '../button';
import { cn } from 'next/lib/utils';

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    showCloseButton?: boolean;
  }>(),
  {
    showCloseButton: false,
  }
);
</script>

<template>
  <div
    data-slot="dialog-footer"
    :class="
      cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        props.class
      )
    "
  >
    <slot />
    <DialogClose v-if="showCloseButton" as-child>
      <Button variant="outline"> Close </Button>
    </DialogClose>
  </div>
</template>
