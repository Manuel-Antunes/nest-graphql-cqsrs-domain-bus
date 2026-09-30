<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import { defineProps, defineEmits } from 'vue';
const props = defineProps({
  link: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
});
const emit = defineEmits(['selectArticle']);
const onClick = () => {
  emit('selectArticle', props.link);
};
</script>

<template>
  <div
    class="flex items-center justify-between rounded cursor-pointer text-n-slate-11 hover:text-n-slate-12 gap-2"
    role="button"
    @click="onClick"
  >
    <Button
      variant="link"
      class="justify-start px-0 text-base font-normal text-current no-underline hover:no-underline"
    >
      {{ title }}
    </Button>
    <span class="i-lucide-chevron-right text-base shrink-0" />
  </div>
</template>
