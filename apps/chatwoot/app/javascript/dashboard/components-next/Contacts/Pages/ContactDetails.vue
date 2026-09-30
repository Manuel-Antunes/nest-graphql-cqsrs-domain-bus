<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { dynamicTime } from 'shared/helpers/timeHelper';

import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import ContactLabels from 'dashboard/components-next/Contacts/ContactLabels/ContactLabels.vue';
import ContactsForm from 'dashboard/components-next/Contacts/ContactsForm/ContactsForm.vue';
import ConfirmContactDeleteDialog from 'dashboard/components-next/Contacts/ContactsForm/ConfirmContactDeleteDialog.vue';
import Policy from 'dashboard/components/policy.vue';

const props = defineProps({
  selectedContact: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['goToContactsList']);

const { t } = useI18n();
const store = useStore();

const avatarFile = ref(null);
const avatarUrl = ref('');

const contactsFormRef = ref(null);

const uiFlags = useMapGetter('contacts/getUIFlags');
const isUpdating = computed(() => uiFlags.value.isUpdating);

const isFormInvalid = computed(() => contactsFormRef.value?.isFormInvalid);

const contactData = ref({});

const getInitialContactData = () => {
  if (!props.selectedContact) return {};
  return { ...props.selectedContact };
};

onMounted(() => {
  Object.assign(contactData.value, getInitialContactData());
});

const createdAt = computed(() => {
  return contactData.value?.createdAt
    ? dynamicTime(contactData.value.createdAt)
    : '';
});

const lastActivityAt = computed(() => {
  return contactData.value?.lastActivityAt
    ? dynamicTime(contactData.value.lastActivityAt)
    : '';
});

const avatarSrc = computed(() => {
  return avatarUrl.value ? avatarUrl.value : contactData.value?.thumbnail;
});

const handleFormUpdate = updatedData => {
  Object.assign(contactData.value, updatedData);
};

const updateContact = async () => {
  try {
    const { customAttributes, ...basicContactData } = contactData.value;
    await store.dispatch('contacts/update', basicContactData);
    await store.dispatch(
      'contacts/fetchContactableInbox',
      props.selectedContact.id
    );
    useAlert(t('CONTACTS_LAYOUT.CARD.EDIT_DETAILS_FORM.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('CONTACTS_LAYOUT.CARD.EDIT_DETAILS_FORM.ERROR_MESSAGE'));
  }
};

const handleAvatarUpload = async ({ file, url }) => {
  avatarFile.value = file;
  avatarUrl.value = url;

  try {
    await store.dispatch('contacts/update', {
      ...contactsFormRef.value?.state,
      avatar: file,
      isFormData: true,
    });
    useAlert(t('CONTACTS_LAYOUT.DETAILS.AVATAR.UPLOAD.SUCCESS_MESSAGE'));
  } catch {
    useAlert(t('CONTACTS_LAYOUT.DETAILS.AVATAR.UPLOAD.ERROR_MESSAGE'));
  }
};

const handleAvatarDelete = async () => {
  try {
    if (props.selectedContact && props.selectedContact.id) {
      await store.dispatch('contacts/deleteAvatar', props.selectedContact.id);
      useAlert(t('CONTACTS_LAYOUT.DETAILS.AVATAR.DELETE.SUCCESS_MESSAGE'));
    }
    avatarFile.value = null;
    avatarUrl.value = '';
    contactData.value.thumbnail = null;
  } catch (error) {
    useAlert(
      error.message
        ? error.message
        : t('CONTACTS_LAYOUT.DETAILS.AVATAR.DELETE.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <div class="flex flex-col items-start gap-8 pb-6">
    <div class="flex flex-col items-start gap-3">
      <Avatar
        :src="avatarSrc || ''"
        :name="selectedContact?.name || ''"
        :size="72"
        allow-upload
        @upload="handleAvatarUpload"
        @delete="handleAvatarDelete"
      />
      <div class="flex flex-col gap-1">
        <h3 class="text-base font-medium text-n-slate-12">
          {{ selectedContact?.name }}
        </h3>
        <div class="flex flex-col gap-1.5">
          <span
            v-if="selectedContact?.identifier"
            class="inline-flex items-center gap-1 text-muted-foreground truncate"
          >
            <span class="i-ph-user-gear text-n-slate-10 size-4" />
            {{ selectedContact?.identifier }}
          </span>
          <span
            class="inline-flex items-center gap-1 text-muted-foreground truncate"
          >
            <span
              v-if="selectedContact?.identifier"
              class="i-ph-activity text-n-slate-10 size-4"
            />
            {{ $t('CONTACTS_LAYOUT.DETAILS.CREATED_AT', { date: createdAt }) }}
            •
            {{
              $t('CONTACTS_LAYOUT.DETAILS.LAST_ACTIVITY', {
                date: lastActivityAt,
              })
            }}
          </span>
        </div>
      </div>
      <ContactLabels :contact-id="selectedContact?.id" />
    </div>
    <div class="flex flex-col items-start gap-6">
      <ContactsForm
        ref="contactsFormRef"
        :contact-data="contactData"
        is-details-view
        @update="handleFormUpdate"
      />
      <Button
        variant="default"
        :disabled="isUpdating || isFormInvalid"
        @click="updateContact"
      >
        <Spinner v-if="isUpdating" class="size-4 flex-shrink-0" />
        <template v-if="!isUpdating">{{
          t('CONTACTS_LAYOUT.CARD.EDIT_DETAILS_FORM.UPDATE_BUTTON')
        }}</template>
      </Button>
    </div>
    <Policy :permissions="['administrator']">
      <div
        class="flex flex-col items-start w-full gap-4 pt-6 border-t border-n-strong"
      >
        <div class="flex flex-col gap-2">
          <h6 class="text-base font-medium text-n-slate-12">
            {{ t('CONTACTS_LAYOUT.DETAILS.DELETE_CONTACT') }}
          </h6>
          <span class="text-muted-foreground truncate">
            {{ t('CONTACTS_LAYOUT.DETAILS.DELETE_CONTACT_DESCRIPTION') }}
          </span>
        </div>
        <ConfirmContactDeleteDialog
          :selected-contact="selectedContact"
          @go-to-contacts-list="emit('goToContactsList')"
        >
          <template #trigger>
            <Button variant="destructive">{{
              t('CONTACTS_LAYOUT.DETAILS.DELETE_CONTACT')
            }}</Button>
          </template>
        </ConfirmContactDeleteDialog>
      </div>
    </Policy>
  </div>
</template>
