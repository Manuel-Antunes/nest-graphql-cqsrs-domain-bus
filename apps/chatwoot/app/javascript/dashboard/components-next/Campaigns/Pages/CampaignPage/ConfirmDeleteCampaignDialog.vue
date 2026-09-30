<script setup>
import { ref } from 'vue';
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
  selectedCampaign: {
    type: Object,
    default: null,
  },
});

const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const deleteCampaign = async id => {
  if (!id) return;

  try {
    await store.dispatch('campaigns/delete', id);
    useAlert(t('CAMPAIGN.CONFIRM_DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('CAMPAIGN.CONFIRM_DELETE.API.ERROR_MESSAGE'));
  }
};

const handleDialogConfirm = async () => {
  await deleteCampaign(props.selectedCampaign.id);
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
        <DialogTitle>{{ t('CAMPAIGN.CONFIRM_DELETE.TITLE') }}</DialogTitle>
        <DialogDescription>
          {{ t('CAMPAIGN.CONFIRM_DELETE.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button class="w-full" @click="handleDialogConfirm">
          {{ t('CAMPAIGN.CONFIRM_DELETE.CONFIRM') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
