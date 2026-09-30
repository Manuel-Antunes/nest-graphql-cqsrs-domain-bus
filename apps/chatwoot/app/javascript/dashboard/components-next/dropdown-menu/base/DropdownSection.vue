<script setup>
import { DropdownMenuGroup, DropdownMenuLabel } from 'reka-ui';

defineProps({
  title: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <DropdownMenuGroup class="-mx-2 n-dropdown-section">
    <DropdownMenuLabel
      v-if="title"
      class="px-4 mb-3 mt-1 leading-4 font-medium tracking-[0.2px] text-n-slate-10 text-xs"
    >
      {{ title }}
    </DropdownMenuLabel>
    <ul class="gap-2 grid reset-base list-none px-2 max-h-96 overflow-y-auto">
      <slot />
    </ul>
  </DropdownMenuGroup>
</template>
