<script setup>
import { Button } from 'dashboard/components-next/ui/button';

defineProps({
  label: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <Button variant="ghost" class="justify-start">
    {{ label }}
  </Button>
</template>
