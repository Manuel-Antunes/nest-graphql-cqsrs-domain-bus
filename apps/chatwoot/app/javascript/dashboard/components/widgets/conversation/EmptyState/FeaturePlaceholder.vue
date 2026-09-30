<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const keyShortcuts = computed(() => [
  {
    key: 'K',
    description: t('CONVERSATION.EMPTY_STATE.CMD_BAR'),
  },
  {
    key: '/',
    description: t('CONVERSATION.EMPTY_STATE.KEYBOARD_SHORTCUTS'),
  },
]);
</script>

<template>
  <div class="flex flex-col gap-2 mt-9">
    <div
      v-for="keyShortcut in keyShortcuts"
      :key="keyShortcut.key"
      class="flex items-center gap-2"
    />
  </div>
</template>
