<script setup>
import { useI18n } from 'vue-i18n';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

defineProps({
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['loadMore']);

const { t } = useI18n();
</script>

<template>
  <div class="flex justify-center py-4">
    <Button
      variant="secondary"
      size="sm"
      :disabled="isLoading"
      @click="emit('loadMore')"
    >
      <Spinner v-if="isLoading" class="size-4" />
      {{ t('CONTACTS_LAYOUT.LOAD_MORE') }}
    </Button>
  </div>
</template>
