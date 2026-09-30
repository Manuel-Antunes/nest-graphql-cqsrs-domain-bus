<script setup lang="ts">
import type { AriaAttributes, ComponentPublicInstance, HTMLAttributes } from 'vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { cn } from 'next/lib/utils';
import { useMessageScrollerContext } from './useMessageScroller';

const props = defineProps<{
  ariaRelevant?: AriaAttributes['aria-relevant'];
  role?: string;
  spacerClass?: HTMLAttributes['class'];
  class?: HTMLAttributes['class'];
}>();

const ctx = useMessageScrollerContext();
const contentEl = ref<HTMLElement | null>(null);

function setContent(ref: Element | ComponentPublicInstance | null): void {
  ctx.setContentElement(ref);
  contentEl.value = ref instanceof HTMLElement ? ref : null;
}

let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  const element = contentEl.value;
  if (!element) return;
  ctx.handleContentChange();
  if (typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(() => ctx.handleContentChange());
    mutationObserver.observe(element, { childList: true });
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => ctx.handleResize());
    resizeObserver.observe(element);
  }
});
onBeforeUnmount(() => {
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
  mutationObserver = null;
  resizeObserver = null;
});
</script>

<template>
  <div
    :ref="setContent"
    data-slot="message-scroller-content"
    :role="role ?? 'log'"
    :aria-relevant="ariaRelevant ?? 'additions'"
    :class="cn('flex h-max min-h-full flex-col gap-8', props.class)"
  >
    <slot />
    <div
      :ref="ctx.setSpacerElement"
      aria-hidden="true"
      data-message-scroller-spacer=""
      hidden
      :class="spacerClass"
    />
  </div>
</template>
