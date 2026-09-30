<script setup>
import { ref, computed } from 'vue';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'next/ui/dialog';
import ResponseForm from './ResponseForm.vue';

const props = defineProps({
  selectedResponse: {
    type: Object,
    default: () => ({}),
  },
  type: {
    type: String,
    default: 'create',
    validator: value => ['create', 'edit'].includes(value),
  },
});
const emit = defineEmits(['close']);
const { t } = useI18n();
const store = useStore();
const { currentParams } = useAppNavigation();

const isOpen = ref(false);
const responseForm = ref(null);

const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
  emit('close');
};

const updateResponse = responseDetails =>
  store.dispatch('captainResponses/update', {
    id: props.selectedResponse.id,
    ...responseDetails,
  });

const i18nKey = computed(() => `CAPTAIN.RESPONSES.${props.type.toUpperCase()}`);

const createResponse = responseDetails =>
  store.dispatch('captainResponses/create', responseDetails);

const handleSubmit = async updatedResponse => {
  try {
    if (props.type === 'edit') {
      await updateResponse({
        ...updatedResponse,
        assistant_id: currentParams.value.assistantId,
      });
    } else {
      await createResponse({
        ...updatedResponse,
        assistant_id: currentParams.value.assistantId,
      });
    }
    useAlert(t(`${i18nKey.value}.SUCCESS_MESSAGE`));
    close();
  } catch (error) {
    const errorMessage =
      error?.response?.message || t(`${i18nKey.value}.ERROR_MESSAGE`);
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
          $t('CAPTAIN.RESPONSES.FORM_DESCRIPTION')
        }}</DialogDescription>
      </DialogHeader>
      <ResponseForm
        ref="responseForm"
        :mode="type"
        :response="selectedResponse"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </DialogContent>
  </Dialog>
</template>
