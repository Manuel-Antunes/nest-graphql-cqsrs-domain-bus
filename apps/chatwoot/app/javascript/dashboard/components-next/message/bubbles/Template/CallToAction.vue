<script setup>
import { Button } from 'dashboard/components-next/ui/button';

defineProps({
  message: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <div class="text-n-slate-12 max-w-80 flex flex-col gap-2.5">
    <div class="p-3 bg-n-alpha-2 rounded-xl">
      <span
        v-dompurify-html="message.content"
        class="prose prose-bubble font-medium text-sm"
      />
    </div>
    <div class="flex gap-2">
      <Button variant="outline" class="w-full">Call us</Button>
      <Button variant="outline" class="w-full">Visit our website</Button>
    </div>
  </div>
</template>
