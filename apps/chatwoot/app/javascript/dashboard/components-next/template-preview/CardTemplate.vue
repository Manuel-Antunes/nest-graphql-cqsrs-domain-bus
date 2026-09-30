<script setup>
import { Button } from 'dashboard/components-next/ui/button';
defineProps({
  message: {
    type: Object,
    required: true,
  },
});

const ACTION_LABELS = ['Call us to order', 'Visit our store'];
</script>

<template>
  <div
    class="rounded-xl divide-y bg-n-alpha-2 divide-n-strong text-n-slate-12 max-w-80"
  >
    <div class="px-3 py-2.5">
      <img :src="message.image_url" class="w-full max-h-44 rounded-lg" />
      <div class="flex flex-col gap-2 pt-2.5">
        <h6 class="font-semibold">{{ message.title }}</h6>
        <span
          v-dompurify-html="message.content"
          class="text-sm prose prose-bubble"
        />
      </div>
    </div>
    <div
      v-for="label in ACTION_LABELS"
      :key="label"
      class="p-3 flex items-center justify-center"
    >
      <Button variant="ghost">{{ label }}</Button>
    </div>
  </div>
</template>
