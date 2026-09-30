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

const emit = defineEmits(['add']);

const { t } = useI18n();

const isOpen = ref(false);
const currentInbox = ref(null);

const openDialog = inbox => {
  currentInbox.value = inbox;
  isOpen.value = true;
};

const closeDialog = () => {
  isOpen.value = false;
};

const handleDialogConfirm = () => {
  emit('add', currentInbox.value.id);
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
          {{
            t(
              'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.CONFIRM_ADD_INBOX_DIALOG.TITLE'
            )
          }}
        </DialogTitle>
        <DialogDescription>
          {{
            t(
              'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.CONFIRM_ADD_INBOX_DIALOG.DESCRIPTION',
              {
                inboxName: currentInbox?.name,
              }
            )
          }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{
              t(
                'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.CONFIRM_ADD_INBOX_DIALOG.CANCEL_BUTTON_LABEL'
              )
            }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{
            t(
              'ASSIGNMENT_POLICY.AGENT_ASSIGNMENT_POLICY.EDIT.CONFIRM_ADD_INBOX_DIALOG.CONFIRM_BUTTON_LABEL'
            )
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
