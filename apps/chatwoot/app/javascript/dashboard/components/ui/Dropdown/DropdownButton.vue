<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

defineProps({
  buttonText: {
    type: String,
    default: '',
  },
  trailingIcon: {
    type: Boolean,
    default: false,
  },
  icon: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <Button
    variant="ghost"
    class="relative"
  >
    <Icon v-if="icon && !trailingIcon" :icon="icon" class="mr-1" />
    <span class="min-w-0 truncate">{{ buttonText }}</span>
    <Icon v-if="icon && trailingIcon" :icon="icon" class="ml-1" />
    <slot name="dropdown" />
  </Button>
</template>
