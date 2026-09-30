<script setup>
import { computed, useAttrs } from 'vue';
import { DropdownMenuContent, DropdownMenuPortal } from 'reka-ui';
import { cn } from 'next/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
  side: { type: String, default: 'bottom' },
  align: { type: String, default: 'start' },
  sideOffset: { type: Number, default: 4 },
  strong: { type: Boolean, default: false },
});

defineOptions({ inheritAttrs: false });

const STRONG_OVERLAY =
  "before:content-['\\u00A0'] before:absolute before:bottom-0 before:left-0 before:w-full before:h-full before:rounded-xl before:backdrop-contrast-70 before:backdrop-blur-sm before:z-0 [&>*]:relative";

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const contentClass = computed(() =>
  cn(
    'z-50 text-sm bg-n-alpha-3 backdrop-blur-[100px] border rounded-xl shadow-sm py-2 list-none px-2 relative',
    props.strong ? 'border-n-strong' : 'border-n-weak',
    props.strong && STRONG_OVERLAY,
    props.class
  )
);
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      v-bind="forwardedAttrs"
      :side="side"
      :align="align"
      :side-offset="sideOffset"
      :class="contentClass"
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>
