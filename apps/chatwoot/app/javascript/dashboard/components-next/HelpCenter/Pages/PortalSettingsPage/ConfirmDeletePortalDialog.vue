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

defineProps({
  activePortalName: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['deletePortal']);

const { t } = useI18n();

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const handleDialogConfirm = () => {
  emit('deletePortal');
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
          {{
            t(
              'HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.DELETE_PORTAL.DIALOG.HEADER',
              {
                portalName: activePortalName,
              }
            )
          }}
        </DialogTitle>
        <DialogDescription>
          {{
            t(
              'HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.DELETE_PORTAL.DIALOG.DESCRIPTION'
            )
          }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{
            t(
              'HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.DELETE_PORTAL.DIALOG.CONFIRM_BUTTON_LABEL'
            )
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
