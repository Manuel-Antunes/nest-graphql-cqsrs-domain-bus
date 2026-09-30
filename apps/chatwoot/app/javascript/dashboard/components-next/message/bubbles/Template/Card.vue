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
  <div
    class="bg-n-alpha-2 divide-y divide-n-strong text-n-slate-12 rounded-xl max-w-80"
  >
    <div class="px-3 py-2.5">
      <img :src="message.image_url" class="max-h-44 rounded-lg w-full" />
      <div class="pt-2.5 flex flex-col gap-2">
        <h6 class="font-semibold">{{ message.title }}</h6>
        <span
          v-dompurify-html="message.content"
          class="prose prose-bubble text-sm"
        />
      </div>
    </div>
    <div class="p-3 flex items-center justify-center">
      <Button variant="ghost">Call us to order</Button>
    </div>
    <div class="p-3 flex items-center justify-center">
      <Button variant="ghost">Visit our store</Button>
    </div>
  </div>
</template>
