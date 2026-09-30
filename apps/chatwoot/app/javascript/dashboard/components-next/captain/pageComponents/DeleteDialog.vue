<script setup>
import { ref, computed } from 'vue';
import { useStore } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
  translationKey: {
    type: String,
    required: true,
  },
  entity: {
    type: Object,
    required: true,
  },
  deletePayload: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['deleteSuccess']);

const { t } = useI18n();
const store = useStore();
const isOpen = ref(false);
const i18nKey = computed(() => {
  return props.translationKey || props.type.toUpperCase();
});

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const deleteEntity = async payload => {
  if (!payload) return;

  try {
    await store.dispatch(`captain${props.type}/delete`, payload);
    emit('deleteSuccess');
    useAlert(t(`CAPTAIN.${i18nKey.value}.DELETE.SUCCESS_MESSAGE`));
  } catch (error) {
    useAlert(t(`CAPTAIN.${i18nKey.value}.DELETE.ERROR_MESSAGE`));
  }
};

const handleDialogConfirm = async () => {
  await deleteEntity(props.deletePayload || props.entity.id);
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
        <DialogTitle>{{ t(`CAPTAIN.${i18nKey}.DELETE.TITLE`) }}</DialogTitle>
        <DialogDescription>
          {{ t(`CAPTAIN.${i18nKey}.DELETE.DESCRIPTION`) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{ t(`CAPTAIN.${i18nKey}.DELETE.CONFIRM`) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
