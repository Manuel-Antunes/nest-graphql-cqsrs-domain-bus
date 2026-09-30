<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { MarkerVariants } from '.';
import { Primitive } from 'reka-ui';
import { cn } from 'next/lib/utils';
import { markerVariants } from '.';

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      variant?: MarkerVariants['variant'];
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    as: 'div',
    variant: 'default',
  }
);
</script>

<template>
  <Primitive
    data-slot="marker"
    :data-variant="variant"
    :as="as"
    :as-child="asChild"
    :class="cn(markerVariants({ variant }), props.class)"
  >
    <slot />
  </Primitive>
</template>
