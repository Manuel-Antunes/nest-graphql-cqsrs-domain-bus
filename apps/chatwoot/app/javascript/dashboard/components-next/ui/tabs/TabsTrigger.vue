<script setup>
import { TabsTrigger } from 'reka-ui';
import { cn } from 'next/lib/utils';

const props = defineProps({
  value: { type: [String, Number], required: true },
  class: { type: null, default: '' },
});
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :value="props.value"
    :class="
      cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        props.class
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
