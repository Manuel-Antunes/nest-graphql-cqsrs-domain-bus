<script setup>
import { reactive, ref, computed, onMounted, watch } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useWindowSize } from '@vueuse/core';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useAlert } from 'dashboard/composables';
import { parseAPIErrorResponse } from 'dashboard/store/utils/api';
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
  createContactSearcher,
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
  align: {
    type: String,
    default: '',
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

const searchContacts = createContactSearcher();
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

const formState = reactive({
  message: '',
  subject: '',
  ccEmails: '',
  bccEmails: '',
  attachedFiles: [],
});

const clearFormState = () => {
  Object.assign(formState, {
    subject: '',
    ccEmails: '',
    bccEmails: '',
    attachedFiles: [],
  });
};

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

const popoverAlign = computed(() => {
  if (props.align) return props.align;
  return props.alignPosition === 'right' ? 'start' : 'end';
});

const onContactSearch = debounce(
  async query => {
    isSearching.value = true;
    contacts.value = [];
    try {
      const results = await searchContacts(query);
      // null means the request was aborted (a newer search is in-flight),
      if (results === null) return;
      contacts.value = results;
      isSearching.value = false;
    } catch (error) {
      isSearching.value = false;
      useAlert(t('COMPOSE_NEW_CONVERSATION.CONTACT_SEARCH.ERROR_MESSAGE'));
    }
  },
  400,
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
      const message = parseAPIErrorResponse(error);
      useAlert(
        typeof message === 'string'
          ? message
          : t('COMPOSE_NEW_CONVERSATION.CONTACT_CREATE.ERROR_MESSAGE')
      );
      return;
    }
  } else {
    contact = rest;
  }
  selectedContact.value = contact;
  contacts.value = [];
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
  if (!inbox) clearFormState();
  resetContacts();
};

const clearSelectedContact = () => {
  selectedContact.value = null;
  targetInbox.value = null;
  clearFormState();
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

const discardCompose = () => {
  clearFormState();
  formState.message = '';
  closeCompose();
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
    discardCompose();
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
      if (currentContact?.id !== previousContact?.id) {
        clearSelectedContact();
        clearFormState();
        formState.message = '';
      }

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
  // Cache-aware refetch, so newly synced WhatsApp templates show up here
  // even if the account-cache-invalidated websocket event was missed.
  if (val) store.dispatch('inboxes/get');
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
    <div class="contents" @click="toggle">
      <slot name="trigger" :is-open="showComposeNewConversation">
        <Button variant="outline" size="icon">
          <Icon icon="i-lucide-pen-line" />
        </Button>
      </slot>
    </div>
    <div
      v-if="showComposeNewConversation"
      class="fixed z-50 bg-n-alpha-black1 backdrop-blur-[4px] flex items-start pt-[clamp(3rem,15vh,12rem)] justify-center inset-0"
      @click.self="onModalBackdropClick"
    >
      <ComposeNewConversationForm
        :form-state="formState"
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
        @discard="discardCompose"
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
      <slot name="trigger" :is-open="showComposeNewConversation">
        <Button variant="outline" size="icon">
          <Icon icon="i-lucide-pen-line" />
        </Button>
      </slot>
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
        :form-state="formState"
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
        @discard="discardCompose"
      />
    </PopoverContent>
  </Popover>
</template>
