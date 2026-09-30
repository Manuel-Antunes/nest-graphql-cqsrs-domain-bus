<script setup lang="ts">
import type { WithClassAsProps } from './interface';
import { cn } from 'next/lib/utils';
import { useMessageScrollerContext } from './useMessageScroller';

const props = defineProps<WithClassAsProps>();
const { setRootElement } = useMessageScrollerContext();
</script>

<template>
  <div
    :ref="setRootElement"
    data-slot="message-scroller"
    :class="
      cn(
        'group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
