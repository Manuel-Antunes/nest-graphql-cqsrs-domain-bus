<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'next/icon/Icon.vue';

const emit = defineEmits(['add']);

const addLabel = () => {
  emit('add');
};
</script>

<template>
  <Button class="w-full" @click="addLabel">
    <Icon icon="i-lucide-plus" />
    {{ $t('CONTACT_PANEL.LABELS.CONVERSATION.ADD_BUTTON') }}
  </Button>
</template>
