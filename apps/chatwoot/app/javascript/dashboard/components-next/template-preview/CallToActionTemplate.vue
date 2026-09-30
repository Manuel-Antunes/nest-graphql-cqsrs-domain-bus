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
  <div class="flex flex-col gap-2.5 text-n-slate-12 max-w-80">
    <div class="p-3 rounded-xl bg-n-alpha-2">
      <span
        v-dompurify-html="message.content"
        class="text-sm font-medium prose prose-bubble"
      />
    </div>
    <div
      v-if="message.buttons && message.buttons.length > 0"
      class="flex flex-col gap-2"
    >
      <Button
        v-for="(button, index) in message.buttons"
        :key="index"
        variant="outline"
        class="w-full"
      >
        {{ button.text || button.title || 'Button' }}
      </Button>
    </div>
  </div>
</template>
