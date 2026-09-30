<script setup>
import { ref } from 'vue';
import { DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui';
import { provideDropdownContext } from './provider.js';

const emit = defineEmits(['close']);

const isOpen = ref(false);

const handleOpenChange = val => {
  isOpen.value = val;
  if (!val) emit('close');
};

const toggle = () => handleOpenChange(!isOpen.value);
const closeMenu = () => handleOpenChange(false);

provideDropdownContext({
  isOpen,
  toggle,
  closeMenu,
});
</script>

<template>
  <DropdownMenuRoot :open="isOpen" @update:open="handleOpenChange">
    <DropdownMenuTrigger as-child>
      <slot name="trigger" :is-open="isOpen" :toggle="toggle" />
    </DropdownMenuTrigger>
    <slot />
  </DropdownMenuRoot>
</template>
