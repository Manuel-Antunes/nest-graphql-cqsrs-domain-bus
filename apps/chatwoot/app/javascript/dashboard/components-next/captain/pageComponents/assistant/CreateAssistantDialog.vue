<script setup>
import { ref, computed } from 'vue';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'next/ui/dialog';
import AssistantForm from './AssistantForm.vue';

const props = defineProps({
  selectedAssistant: {
    type: Object,
    default: () => ({}),
  },
  type: {
    type: String,
    default: 'create',
    validator: value => ['create', 'edit'].includes(value),
  },
});
const emit = defineEmits(['close', 'created']);
const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);
const assistantForm = ref(null);

const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
  emit('close');
};

const updateAssistant = assistantDetails =>
  store.dispatch('captainAssistants/update', {
    id: props.selectedAssistant.id,
    ...assistantDetails,
  });

const i18nKey = computed(
  () => `CAPTAIN.ASSISTANTS.${props.type.toUpperCase()}`
);

const createAssistant = async assistantDetails => {
  try {
    const newAssistant = await store.dispatch(
      'captainAssistants/create',
      assistantDetails
    );
    emit('created', newAssistant);
  } catch (error) {
    const errorMessage = error?.message || t(`${i18nKey.value}.ERROR_MESSAGE`);
    useAlert(errorMessage);
  }
};

const handleSubmit = async updatedAssistant => {
  try {
    if (props.type === 'edit') {
      await updateAssistant(updatedAssistant);
    } else {
      await createAssistant(updatedAssistant);
    }
    useAlert(t(`${i18nKey.value}.SUCCESS_MESSAGE`));
    close();
  } catch (error) {
    const errorMessage = error?.message || t(`${i18nKey.value}.ERROR_MESSAGE`);
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
    <DialogContent class="overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ t(`${i18nKey}.TITLE`) }}</DialogTitle>
        <DialogDescription>
          {{ t('CAPTAIN.ASSISTANTS.FORM_DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <AssistantForm
        ref="assistantForm"
        :mode="type"
        :assistant="selectedAssistant"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </DialogContent>
  </Dialog>
</template>
