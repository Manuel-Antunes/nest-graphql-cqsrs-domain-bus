<script setup>
import { computed } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAccount } from 'dashboard/composables/useAccount';
import { useI18n } from 'vue-i18n';
import { useToggle } from '@vueuse/core';
import { useAlert } from 'dashboard/composables';
import WootConfirmDeleteModal from 'dashboard/components/widgets/modal/ConfirmDeleteModal.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import SectionLayout from './SectionLayout.vue';

const { t } = useI18n();
const store = useStore();
const uiFlags = useMapGetter('accounts/getUIFlags');
const { currentAccount } = useAccount();
const [showDeletePopup, toggleDeletePopup] = useToggle();

const confirmPlaceHolderText = computed(() => {
  return `${t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.CONFIRM.PLACE_HOLDER', {
    accountName: currentAccount.value.name,
  })}`;
});

const isMarkedForDeletion = computed(() => {
  const { custom_attributes = {} } = currentAccount.value;
  return !!custom_attributes.marked_for_deletion_at;
});

const markedForDeletionDate = computed(() => {
  const { custom_attributes = {} } = currentAccount.value;
  if (!custom_attributes.marked_for_deletion_at) return null;
  return new Date(custom_attributes.marked_for_deletion_at);
});

const markedForDeletionReason = computed(() => {
  const { custom_attributes = {} } = currentAccount.value;
  return custom_attributes.marked_for_deletion_reason || 'manual_deletion';
});

const formattedDeletionDate = computed(() => {
  if (!markedForDeletionDate.value) return '';
  return markedForDeletionDate.value.toLocaleString();
});

const markedForDeletionMessage = computed(() => {
  const params = { deletionDate: formattedDeletionDate.value };

  if (markedForDeletionReason.value === 'manual_deletion') {
    return t(
      `GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.SCHEDULED_DELETION.MESSAGE_MANUAL`,
      params
    );
  }

  return t(
    `GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.SCHEDULED_DELETION.MESSAGE_INACTIVITY`,
    params
  );
});

function handleDeletionError(error) {
  const message = error.response?.data?.message;
  if (message) {
    useAlert(message);
    return;
  }
  useAlert(t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.FAILURE'));
}

async function markAccountForDeletion() {
  toggleDeletePopup(false);
  try {
    // Use the enterprise API to toggle deletion with delete action
    await store.dispatch('accounts/toggleDeletion', {
      action_type: 'delete',
    });
    // Refresh account data
    await store.dispatch('accounts/get');
    useAlert(t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.SUCCESS'));
  } catch (error) {
    // Handle error message
    handleDeletionError(error);
  }
}

async function clearDeletionMark() {
  try {
    // Use the enterprise API to toggle deletion with undelete action
    await store.dispatch('accounts/toggleDeletion', {
      action_type: 'undelete',
    });

    // Refresh account data
    await store.dispatch('accounts/get');
    useAlert(t('GENERAL_SETTINGS.UPDATE.SUCCESS'));
  } catch (error) {
    useAlert(t('GENERAL_SETTINGS.UPDATE.ERROR'));
  }
}
</script>

<template>
  <SectionLayout
    :title="t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.TITLE')"
    :description="t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.NOTE')"
    with-border
  >
    <div v-if="isMarkedForDeletion">
      <div class="p-4 flex-grow-0 flex-shrink-0 flex-[50%] bg-n-ruby-4 rounded">
        <p class="mb-4">
          {{ markedForDeletionMessage }}
        </p>
        <Button
          variant="destructive"
          :disabled="uiFlags.isUpdating"
          @click="clearDeletionMark"
        >
          <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isUpdating">{{
            $t(
              'GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.SCHEDULED_DELETION.CLEAR_BUTTON'
            )
          }}</template>
        </Button>
      </div>
    </div>
    <div v-if="!isMarkedForDeletion">
      <Button variant="destructive" @click="toggleDeletePopup(true)">{{
        $t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.BUTTON_TEXT')
      }}</Button>
    </div>
  </SectionLayout>
  <WootConfirmDeleteModal
    v-if="showDeletePopup"
    v-model:show="showDeletePopup"
    :title="$t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.CONFIRM.TITLE')"
    :message="$t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.CONFIRM.MESSAGE')"
    :confirm-text="
      $t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.CONFIRM.BUTTON_TEXT')
    "
    :reject-text="$t('GENERAL_SETTINGS.ACCOUNT_DELETE_SECTION.CONFIRM.DISMISS')"
    :confirm-value="currentAccount.name"
    :confirm-place-holder-text="confirmPlaceHolderText"
    @on-confirm="markAccountForDeletion"
    @on-close="toggleDeletePopup(false)"
  />
</template>
