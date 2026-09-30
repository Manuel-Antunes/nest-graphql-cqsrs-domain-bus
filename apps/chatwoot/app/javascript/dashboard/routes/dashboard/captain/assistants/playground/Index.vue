<script setup>
import { computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import PageLayout from 'dashboard/components-next/captain/PageLayout.vue';
import AssistantPlayground from 'dashboard/components-next/captain/assistant/AssistantPlayground.vue';

const { currentParams } = useAppNavigation();
const assistantId = computed(() => Number(currentParams.value.assistantId));
</script>

<template>
  <PageLayout
    show-assistant-switcher
    :show-pagination-footer="false"
    :show-know-more="false"
    class="h-full"
  >
    <template #body>
      <div class="flex flex-col h-full">
        <AssistantPlayground :assistant-id="assistantId" class="bg-n-solid-1" />
      </div>
    </template>
  </PageLayout>
</template>
