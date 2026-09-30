<script setup>
import { TabsList } from 'reka-ui';
import { cn } from 'next/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
});
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    :class="
      cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
        props.class
      )
    "
  >
    <slot />
  </TabsList>
</template>
