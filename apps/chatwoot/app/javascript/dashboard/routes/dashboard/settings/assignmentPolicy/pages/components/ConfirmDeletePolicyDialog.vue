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

const emit = defineEmits(['delete']);

const { t } = useI18n();

const isOpen = ref(false);
const currentPolicyId = ref(null);

const openDialog = policyId => {
  currentPolicyId.value = policyId;
  isOpen.value = true;
};

const closeDialog = () => {
  isOpen.value = false;
};

const handleDialogConfirm = () => {
  emit('delete', currentPolicyId.value);
};

defineExpose({ openDialog, closeDialog });
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="
      val => {
        if (!val) closeDialog();
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t('ASSIGNMENT_POLICY.DELETE_POLICY.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('ASSIGNMENT_POLICY.DELETE_POLICY.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('ASSIGNMENT_POLICY.DELETE_POLICY.CANCEL_BUTTON_LABEL') }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{ t('ASSIGNMENT_POLICY.DELETE_POLICY.CONFIRM_BUTTON_LABEL') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
