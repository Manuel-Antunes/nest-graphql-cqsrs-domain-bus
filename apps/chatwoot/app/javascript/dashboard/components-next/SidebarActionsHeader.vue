<script setup>
import Icon from './icon/Icon.vue';
import Button from './ui/button/Button.vue';
defineProps({
  title: {
    type: String,
    required: true,
  },
  buttons: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['click', 'close']);

const handleButtonClick = button => {
  emit('click', button.key);
};
</script>

<template>
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-n-weak h-12"
  >
    <div class="flex items-center justify-between gap-2 flex-1">
      <span class="font-medium text-sm text-n-slate-12">{{ title }}</span>
      <div class="flex items-center">
        <Button
          v-for="button in buttons"
          :key="button.key"
          v-tooltip="button.tooltip"
          @click="handleButtonClick(button)"
        />
        <Button v-tooltip="$t('GENERAL.CLOSE')" @click="$emit('close')">
          <Icon icon="i-lucide-x" />
        </Button>
      </div>
    </div>
  </div>
</template>
