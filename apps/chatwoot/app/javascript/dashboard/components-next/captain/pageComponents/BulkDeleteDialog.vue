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
  bulkIds: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['deleteSuccess']);

const { t } = useI18n();
const store = useStore();
const isOpen = ref(false);
const i18nKey = computed(() => {
  const i18nTypeMap = {
    AssistantResponse: 'RESPONSES',
    AssistantDocument: 'DOCUMENTS',
  };
  return i18nTypeMap[props.type];
});

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const handleBulkDelete = async ids => {
  if (!ids) return;

  try {
    await store.dispatch('captainBulkActions/handleBulkDelete', {
      ids: Array.from(props.bulkIds),
      type: props.type,
    });

    emit('deleteSuccess');
    useAlert(t(`CAPTAIN.${i18nKey.value}.BULK_DELETE.SUCCESS_MESSAGE`));
  } catch (error) {
    useAlert(t(`CAPTAIN.${i18nKey.value}.BULK_DELETE.ERROR_MESSAGE`));
  }
};

const handleDialogConfirm = async () => {
  await handleBulkDelete(Array.from(props.bulkIds));
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
        <DialogTitle>
          {{ t(`CAPTAIN.${i18nKey}.BULK_DELETE.TITLE`) }}
        </DialogTitle>
        <DialogDescription>
          {{ t(`CAPTAIN.${i18nKey}.BULK_DELETE.DESCRIPTION`) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{ t(`CAPTAIN.${i18nKey}.BULK_DELETE.CONFIRM`) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
