<script setup>
import { ref, computed } from 'vue';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
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
import LiveChatCampaignForm from 'dashboard/components-next/Campaigns/Pages/CampaignPage/LiveChatCampaign/LiveChatCampaignForm.vue';

const props = defineProps({
  selectedCampaign: {
    type: Object,
    default: null,
  },
});

const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);
const liveChatCampaignFormRef = ref(null);

const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
};

const uiFlags = useMapGetter('campaigns/getUIFlags');
const isUpdatingCampaign = computed(() => uiFlags.value.isUpdating);

const isInvalidForm = computed(
  () => liveChatCampaignFormRef.value?.isSubmitDisabled
);

const selectedCampaignId = computed(() => props.selectedCampaign.id);

const updateCampaign = async campaignDetails => {
  try {
    await store.dispatch('campaigns/update', {
      id: selectedCampaignId.value,
      ...campaignDetails,
    });

    useAlert(t('CAMPAIGN.LIVE_CHAT.EDIT.FORM.API.SUCCESS_MESSAGE'));
    close();
  } catch (error) {
    const errorMessage =
      error?.response?.message ||
      t('CAMPAIGN.LIVE_CHAT.EDIT.FORM.API.ERROR_MESSAGE');
    useAlert(errorMessage);
  }
};

const handleSubmit = () => {
  updateCampaign(liveChatCampaignFormRef.value.prepareCampaignDetails());
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
        <DialogTitle>{{ t('CAMPAIGN.LIVE_CHAT.EDIT.TITLE') }}</DialogTitle>
        <DialogDescription />
      </DialogHeader>
      <LiveChatCampaignForm
        ref="liveChatCampaignFormRef"
        mode="edit"
        :selected-campaign="selectedCampaign"
        :show-action-buttons="false"
        @submit="handleSubmit"
      />
      <DialogFooter class="pt-2">
        <DialogClose as-child>
          <Button variant="outline">
            {{ t('CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          :disabled="isUpdatingCampaign || isInvalidForm"
          :loading="isUpdatingCampaign"
          @click="handleSubmit"
        >
          {{ t('CONFIRM') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
