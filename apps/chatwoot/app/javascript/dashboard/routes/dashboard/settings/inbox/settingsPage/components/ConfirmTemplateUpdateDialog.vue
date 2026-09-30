<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

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

const emit = defineEmits(['confirm']);

const { t } = useI18n();

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const handleDialogConfirm = () => {
  emit('confirm');
  close();
};

defineExpose({ dialogRef: { open, close }, open, close });
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
          {{ t('INBOX_MGMT.CSAT.TEMPLATE_UPDATE_DIALOG.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('INBOX_MGMT.CSAT.TEMPLATE_UPDATE_DIALOG.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('INBOX_MGMT.CSAT.TEMPLATE_UPDATE_DIALOG.CANCEL') }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{ t('INBOX_MGMT.CSAT.TEMPLATE_UPDATE_DIALOG.CONFIRM') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
