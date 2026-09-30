<script setup>
import { TabsContent } from 'reka-ui';
import { cn } from 'next/lib/utils';

const props = defineProps({
  value: { type: [String, Number], required: true },
  class: { type: null, default: '' },
});
</script>

<template>
  <TabsContent
    data-slot="tabs-content"
    :value="props.value"
    :class="
      cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        props.class
      )
    "
  >
    <slot />
  </TabsContent>
</template>
