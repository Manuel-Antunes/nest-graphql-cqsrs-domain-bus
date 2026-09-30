<script setup>
import EmptyStateLayout from 'dashboard/components-next/EmptyStateLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const emit = defineEmits(['click']);

const onClick = () => {
  emit('click');
};
</script>

<template>
  <EmptyStateLayout
    :title="$t('CAPTAIN.CUSTOM_TOOLS.EMPTY_STATE.TITLE')"
    :subtitle="$t('CAPTAIN.CUSTOM_TOOLS.EMPTY_STATE.SUBTITLE')"
    :action-perms="['administrator']"
  >
    <template #empty-state-item>
      <div class="min-h-[600px]" />
    </template>
    <template #actions>
      <Button variant="default" @click="onClick">
        <Icon :icon="'i-lucide-plus'" class="size-4" />
        {{ $t('CAPTAIN.CUSTOM_TOOLS.ADD_NEW') }}
      </Button>
    </template>
  </EmptyStateLayout>
</template>
