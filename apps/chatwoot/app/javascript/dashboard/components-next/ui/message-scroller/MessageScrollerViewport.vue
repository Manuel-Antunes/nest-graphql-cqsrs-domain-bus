<script setup lang="ts">
import type { ComponentPublicInstance, HTMLAttributes } from 'vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { cn } from 'next/lib/utils';
import { SCROLL_INTENT_KEYS } from './utils';
import { useMessageScrollerContext } from './useMessageScroller';

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    role?: string;
    tabindex?: number | string;
    preserveScrollOnPrepend?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  {
    preserveScrollOnPrepend: true,
  }
);

const ctx = useMessageScrollerContext();
const viewportEl = ref<HTMLElement | null>(null);

ctx.setPreserveScrollOnPrepend(props.preserveScrollOnPrepend);
watch(
  () => props.preserveScrollOnPrepend,
  value => ctx.setPreserveScrollOnPrepend(value)
);

function setViewport(ref: Element | ComponentPublicInstance | null): void {
  ctx.setViewportElement(ref);
  viewportEl.value = ref instanceof HTMLElement ? ref : null;
}

function onScroll(): void {
  ctx.syncAfterScroll();
}
function onWheel(): void {
  ctx.userScrollIntent();
}
function onTouchMove(): void {
  ctx.userScrollIntent();
}
function onKeydown(event: KeyboardEvent): void {
  if (SCROLL_INTENT_KEYS.has(event.key)) ctx.userScrollIntent();
}

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  const element = viewportEl.value;
  if (!element || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => ctx.handleResize());
  resizeObserver.observe(element);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <div
    :ref="setViewport"
    data-slot="message-scroller-viewport"
    :role="role ?? 'region'"
    :aria-label="ariaLabel ?? 'Messages'"
    :tabindex="tabindex ?? 0"
    :class="
      cn(
        'size-full min-h-0 min-w-0 scroll-fade-b scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-none',
        props.class
      )
    "
    @scroll="onScroll"
    @wheel="onWheel"
    @touchmove="onTouchMove"
    @keydown="onKeydown"
  >
    <slot />
  </div>
</template>
