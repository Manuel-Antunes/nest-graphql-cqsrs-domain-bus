<script setup>
import { ref } from 'vue';
import { useStore } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';

const props = defineProps({
  selectedContact: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['goToContactsList']);

const { t } = useI18n();
const store = useStore();
const { currentParams } = useAppNavigation();

const isOpen = ref(false);

const deleteContact = async id => {
  if (!id) return;

  try {
    await store.dispatch('contacts/delete', id);
    useAlert(t('CONTACTS_LAYOUT.DETAILS.DELETE_DIALOG.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('CONTACTS_LAYOUT.DETAILS.DELETE_DIALOG.API.ERROR_MESSAGE'));
  }
};

const handleDialogConfirm = async () => {
  emit('goToContactsList');
  await deleteContact(currentParams.value.contactId || props.selectedContact.id);
  isOpen.value = false;
};
</script>

<template>
  <AlertDialog :open="isOpen" @update:open="isOpen = $event">
    <AlertDialogTrigger as-child>
      <slot name="trigger" />
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ t('CONTACTS_LAYOUT.DETAILS.DELETE_DIALOG.TITLE') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('CONTACTS_LAYOUT.DETAILS.DELETE_DIALOG.DESCRIPTION') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>
          {{ t('DIALOG.BUTTONS.CANCEL') }}
        </AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="handleDialogConfirm">
          {{ t('CONTACTS_LAYOUT.DETAILS.DELETE_DIALOG.CONFIRM') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
