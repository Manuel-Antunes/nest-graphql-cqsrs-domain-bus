<script setup>
import { computed } from 'vue';
import { Button } from 'dashboard/components-next/ui/button';
import { useI18n } from 'vue-i18n';
import { useKbd } from 'dashboard/composables/utils/useKbd';

defineProps({
  isGeneratingContent: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['submit', 'cancel']);
const { t } = useI18n();
const handleCancel = () => {
  emit('cancel');
};

const shortcutKey = useKbd(['$mod', '+', 'enter']);

const acceptLabel = computed(() => {
  return `${t('GENERAL.ACCEPT')}  (${shortcutKey.value})`;
});

const handleSubmit = () => {
  emit('submit');
};
</script>

<template>
  <div class="flex justify-between items-center p-3 pt-0">
    <Button
      variant="link"
      size="sm"
      class="px-1 text-n-slate-11 hover:no-underline"
      :disabled="isGeneratingContent"
      @click="handleCancel"
    >
      {{ t('GENERAL.DISCARD') }}
    </Button>
    <Button
      size="sm"
      class="bg-n-iris-9 text-white hover:bg-n-iris-10"
      :disabled="isGeneratingContent"
      @click="handleSubmit"
    >
      {{ acceptLabel }}
    </Button>
  </div>
</template>
