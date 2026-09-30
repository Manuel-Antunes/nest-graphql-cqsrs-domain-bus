<script setup>
import { ref, computed, useId } from 'vue';
import {
  useBreakpoints,
  breakpointsTailwind,
  useEventListener,
} from '@vueuse/core';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'dashboard/components-next/ui/popover';
import { useMapGetter } from 'dashboard/composables/store';

const props = defineProps({
  align: {
    type: String,
    default: 'end',
    validator: v => ['start', 'end'].includes(v),
  },
  disableMobileView: {
    type: Boolean,
    default: false,
  },
  closeOnScroll: {
    type: Boolean,
    default: true,
  },
  showContentBorder: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['show', 'hide']);

const popoverId = useId();
const isActive = ref(false);
let triggerElement = null;
const triggerTop = () => triggerElement?.getBoundingClientRect().top ?? 0;

const breakpoints = useBreakpoints(breakpointsTailwind);
const belowMd = breakpoints.smaller('md');
const isMobile = computed(() => !props.disableMobileView && belowMd.value);
const showPopover = computed(() => isActive.value && !isMobile.value);
const showMobileView = computed(() => isActive.value && isMobile.value);

const isRTL = useMapGetter('accounts/isRTL');
const contentDirection = computed(() => (isRTL.value ? 'rtl' : 'ltr'));
const contentAlign = computed(() => {
  if (!isRTL.value) return props.align;
  return props.align === 'start' ? 'end' : 'start';
});

const SCROLL_CLOSE_THRESHOLD = 24;
const triggerTopAtOpen = ref(0);

const show = () => {
  if (isActive.value) return;
  isActive.value = true;
  triggerElement = document.querySelector(
    `[data-popover-trigger="${popoverId}"]`
  );
  triggerTopAtOpen.value = triggerTop();
  emit('show');
};

const hide = () => {
  if (!isActive.value) return;
  isActive.value = false;
  emit('hide');
};

const toggle = () => {
  if (isActive.value) hide();
  else show();
};

const handleOpenChange = open => {
  if (open) show();
  else hide();
};

// The teleported popover tracks its trigger while ancestors scroll; allow
// small drift (trackpad inertia), but close once the trigger moves further.
useEventListener(
  window,
  'scroll',
  event => {
    if (!props.closeOnScroll || !showPopover.value) return;
    if (event.target?.closest?.(`[data-popover-id="${popoverId}"]`)) return;
    if (
      Math.abs(triggerTop() - triggerTopAtOpen.value) > SCROLL_CLOSE_THRESHOLD
    ) {
      hide();
    }
  },
  { capture: true, passive: true }
);

// Selectors for teleported elements that should not trigger close
const clickOutsideIgnore = [
  'dialog.ProseMirror-prompt-backdrop',
  '[data-popover-content]',
];

// An overlay opened from inside the popover teleports out of it, so its own Escape handler
// registers after this one and cannot stop it. Leave Escape to whichever overlay the key
// was pressed in; closing the popover out from under it would discard the work in progress.
const isNestedOverlay = event => {
  const overlay = event.target?.closest?.(clickOutsideIgnore.join(','));
  return Boolean(overlay && overlay.dataset.popoverId !== popoverId);
};

const keepOpenForNestedOverlay = event => {
  if (isNestedOverlay(event)) event.preventDefault();
};

defineExpose({ show, hide, toggle });
</script>

<template>
  <Popover :open="showPopover" @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <span :data-popover-trigger="popoverId" class="inline-flex">
        <slot :is-open="isActive" />
      </span>
    </PopoverTrigger>
    <PopoverContent
      data-popover-content
      :data-popover-id="popoverId"
      :dir="contentDirection"
      :align="contentAlign"
      :side-offset="8"
      :collision-padding="16"
      class="flex flex-col w-auto p-0 overflow-hidden rounded-xl max-h-[var(--reka-popover-content-available-height)]"
      :class="{ 'border-0': !showContentBorder }"
      @escape-key-down="keepOpenForNestedOverlay"
      @interact-outside="keepOpenForNestedOverlay"
    >
      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <slot name="content" :hide="hide" />
      </div>
    </PopoverContent>
  </Popover>

  <DialogRoot :open="showMobileView" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay
        data-popover-backdrop
        class="fixed inset-0 z-50 bg-n-alpha-black1"
      />
      <DialogContent
        data-popover-content
        :data-popover-id="popoverId"
        :dir="contentDirection"
        :aria-describedby="undefined"
        class="fixed z-50 flex flex-col inset-x-4 top-[clamp(3rem,15vh,12rem)] mx-auto max-w-lg max-h-[calc(100vh-4rem)] overflow-hidden bg-popover text-popover-foreground border border-border shadow-xl rounded-xl outline-none"
        @escape-key-down="keepOpenForNestedOverlay"
        @interact-outside="keepOpenForNestedOverlay"
      >
        <DialogTitle class="sr-only" />
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <slot name="content" :hide="hide" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
