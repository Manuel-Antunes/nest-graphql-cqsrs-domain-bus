<script setup>
import { ref, computed } from 'vue';
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
import CustomToolForm from './CustomToolForm.vue';

const props = defineProps({
  selectedTool: {
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

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
  emit('close');
};

const updateTool = toolDetails =>
  store.dispatch('captainCustomTools/update', {
    id: props.selectedTool.id,
    ...toolDetails,
  });

const i18nKey = computed(
  () => `CAPTAIN.CUSTOM_TOOLS.${props.type.toUpperCase()}`
);

const createTool = toolDetails =>
  store.dispatch('captainCustomTools/create', toolDetails);

const handleSubmit = async updatedTool => {
  try {
    if (props.type === 'edit') {
      await updateTool(updatedTool);
    } else {
      await createTool(updatedTool);
    }
    useAlert(t(`${i18nKey.value}.SUCCESS_MESSAGE`));
    close();
  } catch (error) {
    const errorMessage =
      parseAPIErrorResponse(error) || t(`${i18nKey.value}.ERROR_MESSAGE`);
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
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ $t(`${i18nKey}.TITLE`) }}</DialogTitle>
        <DialogDescription>
          {{ $t('CAPTAIN.CUSTOM_TOOLS.FORM_DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <CustomToolForm
        :mode="type"
        :tool="selectedTool"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </DialogContent>
  </Dialog>
</template>
