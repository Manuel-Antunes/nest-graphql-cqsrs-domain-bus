<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { ButtonVariants } from 'next/ui/button';
import type { MessageScrollerButtonDirection } from './interface';
import { computed } from 'vue';
import { ArrowDown } from '@lucide/vue';
import { cn } from 'next/lib/utils';
import { Button } from 'next/ui/button';
import { useMessageScrollerContext } from './useMessageScroller';

const props = withDefaults(
  defineProps<{
    direction?: MessageScrollerButtonDirection;
    behavior?: ScrollBehavior;
    variant?: ButtonVariants['variant'];
    size?: ButtonVariants['size'];
    class?: HTMLAttributes['class'];
  }>(),
  {
    direction: 'end',
    behavior: 'smooth',
    variant: 'secondary',
    size: 'icon-sm',
  }
);

const ctx = useMessageScrollerContext();
const active = computed(() =>
  props.direction === 'start'
    ? ctx.scrollable.value.start
    : ctx.scrollable.value.end
);

function onClick(event: MouseEvent): void {
  if (!active.value) return;
  (event.currentTarget as HTMLElement | null)?.blur();
  if (props.direction === 'start') ctx.scrollToStart({ behavior: props.behavior });
  else ctx.scrollToEnd({ behavior: props.behavior });
}
</script>

<template>
  <Button
    data-slot="message-scroller-button"
    :data-direction="direction"
    :data-active="active ? 'true' : 'false'"
    :variant="variant"
    :size="size"
    :inert="!active"
    :tabindex="active ? undefined : -1"
    :class="
      cn(
        'absolute left-1/2 -translate-x-1/2 border-border bg-background text-foreground transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] data-[direction=end]:bottom-4 data-[direction=end]:data-[active=false]:translate-y-full data-[direction=start]:top-4 data-[direction=start]:data-[active=false]:-translate-y-full data-[direction=start]:[&_svg]:rotate-180',
        props.class
      )
    "
    @click="onClick"
  >
    <slot>
      <ArrowDown />
      <span class="sr-only">{{
        direction === 'end' ? 'Scroll to end' : 'Scroll to start'
      }}</span>
    </slot>
  </Button>
</template>
