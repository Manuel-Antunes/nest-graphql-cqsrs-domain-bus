<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  identifier: {
    type: String,
    required: true,
  },
  issueUrl: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['unlinkIssue']);

const unlinkIssue = () => {
  emit('unlinkIssue');
};

const openIssue = () => {
  window.open(props.issueUrl, '_blank');
};
</script>

<template>
  <div class="flex items-center justify-between">
    <div
      class="flex items-center gap-2 px-2 py-1.5 border rounded-lg border-n-strong"
    >
      <div class="flex items-center gap-1">
        <fluent-icon
          icon="linear"
          size="16"
          class="text-[#5E6AD2]"
          view-box="0 0 19 19"
        />
        <span class="text-xs font-medium text-n-slate-12">
          {{ identifier }}
        </span>
      </div>
      <span class="w-px h-3 text-n-weak bg-n-weak" />

      <Button variant="link" size="icon" @click="openIssue"
        ><Icon icon="i-lucide-arrow-up-right"
      /></Button>
    </div>

    <Button variant="ghost" size="icon" @click="unlinkIssue"
      ><Icon icon="i-lucide-unlink"
    /></Button>
  </div>
</template>
