<script setup>
import { ref, computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';
import ContactsForm from 'dashboard/components-next/Contacts/ContactsForm/ContactsForm.vue';

const emit = defineEmits(['create']);

const { t } = useI18n();

const isOpen = ref(false);
const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
};

const contactsFormRef = ref(null);
const contact = ref(null);

const uiFlags = useMapGetter('contacts/getUIFlags');
const isCreatingContact = computed(() => uiFlags.value.isCreating);

const createNewContact = contactItem => {
  contact.value = contactItem;
};

const handleDialogConfirm = async () => {
  if (!contact.value) return;
  emit('create', contact.value);
};

const onSuccess = () => {
  contactsFormRef.value?.resetForm();
  close();
};

defineExpose({ dialogRef: { open, close }, contactsFormRef, onSuccess });
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
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent class="max-w-3xl overflow-y-auto max-h-[90vh]">
      <DialogHeader>
        <DialogTitle>
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.CONTACT_CREATION.ADD_CONTACT') }}
        </DialogTitle>
      </DialogHeader>
      <ContactsForm
        ref="contactsFormRef"
        is-new-contact
        @update="createNewContact"
      />
      <DialogFooter>
        <Button variant="outline" type="reset" @click="close">
          {{ t('DIALOG.BUTTONS.CANCEL') }}
        </Button>
        <Button
          type="submit"
          :disabled="contactsFormRef?.isFormInvalid || isCreatingContact"
          @click="handleDialogConfirm"
        >
          <Spinner v-if="isCreatingContact" class="size-4 flex-shrink-0" />
          <template v-if="!isCreatingContact">
            {{
              t('CONTACTS_LAYOUT.HEADER.ACTIONS.CONTACT_CREATION.SAVE_CONTACT')
            }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
