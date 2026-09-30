<script setup lang="ts">
import type { ComponentPublicInstance, HTMLAttributes } from 'vue';
import { cn } from 'next/lib/utils';
import { useMessageScrollerContext } from './useMessageScroller';

const props = withDefaults(
  defineProps<{
    messageId?: string;
    scrollAnchor?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  {
    scrollAnchor: false,
  }
);

const ctx = useMessageScrollerContext();
let current: HTMLElement | null = null;

// Vue calls the function ref with the element on mount and `null` on unmount,
// which mirrors the primitive's register/unregister ref-callback contract.
function setItem(ref: Element | ComponentPublicInstance | null): void {
  const element = ref instanceof HTMLElement ? ref : null;
  const previous = current;
  current = element;
  if (props.messageId) ctx.registerMessage(props.messageId, element, previous);
}
</script>

<template>
  <div
    :ref="setItem"
    data-slot="message-scroller-item"
    :data-message-id="messageId"
    :data-scroll-anchor="scrollAnchor ? 'true' : 'false'"
    :class="
      cn(
        'min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
