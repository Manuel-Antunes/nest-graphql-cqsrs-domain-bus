<script setup>
import { ref } from 'vue';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import { parseAPIErrorResponse } from 'dashboard/store/utils/api';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'next/ui/dialog';
import DocumentForm from './DocumentForm.vue';

defineProps({
  assistantId: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['close']);
const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
  emit('close');
};

const i18nKey = 'CAPTAIN.DOCUMENTS.CREATE';

const handleSubmit = async newDocument => {
  try {
    await store.dispatch('captainDocuments/create', newDocument);
    useAlert(t(`${i18nKey}.SUCCESS_MESSAGE`));
    close();
  } catch (error) {
    const errorMessage =
      parseAPIErrorResponse(error) || t(`${i18nKey}.ERROR_MESSAGE`);
    useAlert(errorMessage);
  }
};

const handleCancel = () => {
  close();
};

defineExpose({ dialogRef: { open, close } });
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="
      val => {
        if (!val) close();
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t(`${i18nKey}.TITLE`) }}</DialogTitle>
        <DialogDescription>{{
          $t('CAPTAIN.DOCUMENTS.FORM_DESCRIPTION')
        }}</DialogDescription>
      </DialogHeader>
      <DocumentForm
        :assistant-id="assistantId"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </DialogContent>
  </Dialog>
</template>
