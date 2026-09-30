<script setup>
import { computed } from 'vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
});

const actions = computed(() => props.message.actions || []);
</script>

<template>
  <div
    class="rounded-xl divide-y bg-n-alpha-2 divide-n-strong text-n-slate-12 max-w-80"
  >
    <div class="p-3">
      <span
        v-dompurify-html="message.content"
        class="text-sm font-medium prose prose-bubble"
      />
    </div>
    <div
      v-for="(action, index) in actions"
      :key="index"
      class="flex justify-center items-center p-3"
    >
      <Button variant="ghost">
        <Icon icon="i-woot-quick-reply" class="size-[15px]" />
        {{ action.title || action.text || 'Button' }}
      </Button>
    </div>
  </div>
</template>
