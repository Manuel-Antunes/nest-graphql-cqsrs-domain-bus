<script setup lang="ts">
import FeaturePlaceholder from './FeaturePlaceholder.vue';
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'dashboard/components-next/ui/empty';

defineProps<{
  message: string;
}>();
</script>

<template>
  <Empty class="h-full">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <span class="i-lucide-message-square-dashed size-6" />
      </EmptyMedia>
      <EmptyTitle>{{ message }}</EmptyTitle>
    </EmptyHeader>
    <EmptyContent>
      <!-- Cmd bar, keyboard shortcuts placeholder -->
      <FeaturePlaceholder />
    </EmptyContent>
  </Empty>
</template>
