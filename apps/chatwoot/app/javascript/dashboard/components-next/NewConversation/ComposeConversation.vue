<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useWindowSize } from '@vueuse/core';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useAlert } from 'dashboard/composables';
import { ExceptionWithMessage } from 'shared/helpers/CustomErrors';
import { debounce } from '@chatwoot/utils';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  searchContacts,
  createNewContact,
  fetchContactableInboxes,
  processContactableInboxes,
  mergeInboxDetails,
} from 'dashboard/components-next/NewConversation/helpers/composeConversationHelper';
import wootConstants from 'dashboard/constants/globals';

import ComposeNewConversationForm from 'dashboard/components-next/NewConversation/components/ComposeNewConversationForm.vue';

const props = defineProps({
  alignPosition: {
    type: String,
    default: 'left',
  },
  contactId: {
    type: String,
    default: null,
  },
  isModal: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);

const store = useStore();
const { t } = useI18n();
const { width: windowWidth } = useWindowSize();

const { fetchSignatureFlagFromUISettings } = useUISettings();

const isSmallScreen = computed(
  () => windowWidth.value < wootConstants.SMALL_SCREEN_BREAKPOINT
);

const viewInModal = computed(() => props.isModal || isSmallScreen.value);

const contacts = ref([]);
const selectedContact = ref(null);
const targetInbox = ref(null);
const isCreatingContact = ref(false);
const isFetchingInboxes = ref(false);
const isSearching = ref(false);
const showComposeNewConversation = ref(false);

const contactById = useMapGetter('contacts/getContactById');
const contactsUiFlags = useMapGetter('contacts/getUIFlags');
const currentUser = useMapGetter('getCurrentUser');
const globalConfig = useMapGetter('globalConfig/get');
const uiFlags = useMapGetter('contactConversations/getUIFlags');
const messageSignature = useMapGetter('getMessageSignature');
const inboxesList = useMapGetter('inboxes/getInboxes');

const sendWithSignature = computed(() =>
  fetchSignatureFlagFromUISettings(targetInbox.value?.channelType)
);

const directUploadsEnabled = computed(
  () => globalConfig.value.directUploadsEnabled
);

const activeContact = computed(() => contactById.value(props.contactId));

const popoverAlign = computed(() =>
  props.alignPosition === 'right' ? 'start' : 'end'
);

const onContactSearch = debounce(
  async query => {
    isSearching.value = true;
    contacts.value = [];
    try {
      contacts.value = await searchContacts(query);
      isSearching.value = false;
    } catch (error) {
      useAlert(t('COMPOSE_NEW_CONVERSATION.CONTACT_SEARCH.ERROR_MESSAGE'));
    } finally {
      isSearching.value = false;
    }
  },
  300,
  false
);

const resetContacts = () => {
  contacts.value = [];
};

const handleSelectedContact = async ({ value, action, ...rest }) => {
  let contact;
  if (action === 'create') {
    isCreatingContact.value = true;
    try {
      contact = await createNewContact(value);
      isCreatingContact.value = false;
    } catch (error) {
      isCreatingContact.value = false;
      return;
    }
  } else {
    contact = rest;
  }
  selectedContact.value = contact;
  if (contact?.id) {
    isFetchingInboxes.value = true;
    try {
      const contactableInboxes = await fetchContactableInboxes(contact.id);
      // Merge the processed contactableInboxes with the inboxesList
      selectedContact.value.contactInboxes = mergeInboxDetails(
        contactableInboxes,
        inboxesList.value
      );

      isFetchingInboxes.value = false;
    } catch (error) {
      isFetchingInboxes.value = false;
    }
  }
};

const handleTargetInbox = inbox => {
  targetInbox.value = inbox;
  resetContacts();
};

const clearSelectedContact = () => {
  selectedContact.value = null;
  targetInbox.value = null;
};

const closeCompose = () => {
  showComposeNewConversation.value = false;
  if (!props.contactId) {
    // If contactId is passed as prop
    // Then don't allow to remove the selected contact
    selectedContact.value = null;
  }
  targetInbox.value = null;
  resetContacts();
  emit('close');
};

const createConversation = async ({ payload, isFromWhatsApp }) => {
  try {
    const data = await store.dispatch('contactConversations/create', {
      params: payload,
      isFromWhatsApp,
    });
    const action = {
      type: 'link',
      to: `/app/accounts/${data.account_id}/conversations/${data.id}`,
      message: t('COMPOSE_NEW_CONVERSATION.FORM.GO_TO_CONVERSATION'),
    };
    closeCompose();
    useAlert(t('COMPOSE_NEW_CONVERSATION.FORM.SUCCESS_MESSAGE'), action);
    return true; // Return success
  } catch (error) {
    useAlert(
      error instanceof ExceptionWithMessage
        ? error.data
        : t('COMPOSE_NEW_CONVERSATION.FORM.ERROR_MESSAGE')
    );
    return false; // Return failure
  }
};

const toggle = () => {
  showComposeNewConversation.value = !showComposeNewConversation.value;
};

watch(
  activeContact,
  (currentContact, previousContact) => {
    if (currentContact && props.contactId) {
      // Reset on contact change
      if (currentContact?.id !== previousContact?.id) clearSelectedContact();

      // First process the contactable inboxes to get the right structure
      const processedInboxes = processContactableInboxes(
        currentContact.contactInboxes || []
      );
      // Then Merge processedInboxes with the inboxes list
      selectedContact.value = {
        ...currentContact,
        contactInboxes: mergeInboxDetails(processedInboxes, inboxesList.value),
      };
    }
  },
  { immediate: true, deep: true }
);

const handlePopoverUpdate = val => {
  if (!val) closeCompose();
  else showComposeNewConversation.value = true;
};

// The compose form is itself a Popover, and it nests other teleported poppers
// (the inbox selector, contact combobox, emoji picker, etc.) plus a rich-text editor.
// Clicking inside a nested popper — or the editor grabbing focus — is seen as an
// interaction "outside" the compose popover, which would dismiss it. Keep it open for:
//   1. any FOCUS movement (a compose form must not close because focus shifted — reka's
//      FocusScope treats the ProseMirror editor's focus as "outside", which is why
//      selecting a non-email inbox that hands focus to the editor closed the whole form);
//   2. interactions inside a nested teleported popper;
//   3. interactions inside the rich-text editor (contenteditable / ProseMirror).
const keepComposeOpenOnNestedInteraction = event => {
  const originalEvent = event.detail?.originalEvent;
  const target = originalEvent?.target;

  const isFocusInteraction =
    typeof originalEvent?.type === 'string' &&
    originalEvent.type.startsWith('focus');

  if (
    isFocusInteraction ||
    (target instanceof Element &&
      (target.closest('[data-reka-popper-content-wrapper]') ||
        target.closest('.ProseMirror') ||
        target.isContentEditable))
  ) {
    event.preventDefault();
  }
};

const onModalBackdropClick = () => closeCompose();

onMounted(() => resetContacts());

watch(showComposeNewConversation, val => {
  emitter.emit(BUS_EVENTS.NEW_CONVERSATION_MODAL, val);
});

const keyboardEvents = {
  Escape: {
    action: () => {
      if (showComposeNewConversation.value) closeCompose();
    },
  },
};

useKeyboardEvents(keyboardEvents);
</script>

<template>
  <!-- Modal mode: full-screen overlay for small screens -->
  <template v-if="viewInModal">
    <Button variant="outline" size="icon" @click="toggle">
      <Icon icon="i-lucide-pen-line" />
    </Button>
    <div
      v-if="showComposeNewConversation"
      class="fixed z-50 bg-n-alpha-black1 backdrop-blur-[4px] flex items-start pt-[clamp(3rem,15vh,12rem)] justify-center inset-0"
      @click.self="onModalBackdropClick"
    >
      <ComposeNewConversationForm
        :contacts="contacts"
        :contact-id="contactId"
        :is-loading="isSearching"
        :current-user="currentUser"
        :selected-contact="selectedContact"
        :target-inbox="targetInbox"
        :is-creating-contact="isCreatingContact"
        :is-fetching-inboxes="isFetchingInboxes"
        :is-direct-uploads-enabled="directUploadsEnabled"
        :contact-conversations-ui-flags="uiFlags"
        :contacts-ui-flags="contactsUiFlags"
        :message-signature="messageSignature"
        :send-with-signature="sendWithSignature"
        @search-contacts="onContactSearch"
        @reset-contact-search="resetContacts"
        @update-selected-contact="handleSelectedContact"
        @update-target-inbox="handleTargetInbox"
        @clear-selected-contact="clearSelectedContact"
        @create-conversation="createConversation"
        @discard="closeCompose"
      />
    </div>
  </template>

  <!-- Popover mode: anchored to the trigger for larger screens -->
  <Popover
    v-else
    :open="showComposeNewConversation"
    @update:open="handlePopoverUpdate"
  >
    <PopoverTrigger as-child>
      <Button variant="outline" size="icon">
        <Icon icon="i-lucide-pen-line" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      side="bottom"
      :align="popoverAlign"
      :side-offset="8"
      class="p-0 w-auto border-none shadow-none bg-transparent"
      @pointer-down-outside="keepComposeOpenOnNestedInteraction"
      @focus-outside="keepComposeOpenOnNestedInteraction"
      @interact-outside="keepComposeOpenOnNestedInteraction"
    >
      <ComposeNewConversationForm
        :contacts="contacts"
        :contact-id="contactId"
        :is-loading="isSearching"
        :current-user="currentUser"
        :selected-contact="selectedContact"
        :target-inbox="targetInbox"
        :is-creating-contact="isCreatingContact"
        :is-fetching-inboxes="isFetchingInboxes"
        :is-direct-uploads-enabled="directUploadsEnabled"
        :contact-conversations-ui-flags="uiFlags"
        :contacts-ui-flags="contactsUiFlags"
        :message-signature="messageSignature"
        :send-with-signature="sendWithSignature"
        @search-contacts="onContactSearch"
        @reset-contact-search="resetContacts"
        @update-selected-contact="handleSelectedContact"
        @update-target-inbox="handleTargetInbox"
        @clear-selected-contact="clearSelectedContact"
        @create-conversation="createConversation"
        @discard="closeCompose"
      />
    </PopoverContent>
  </Popover>
</template>
