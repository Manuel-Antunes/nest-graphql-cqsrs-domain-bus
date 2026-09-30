<script setup>
import { computed, ref, useAttrs } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import {
  isVoiceCallEnabled,
  getVoiceCallProvider,
  VOICE_CALL_PROVIDERS,
} from 'dashboard/helper/inbox';
import {
  VOICE_CALL_DIRECTION,
  VOICE_CALL_OUTBOUND_INIT_STATUS,
} from 'dashboard/components-next/message/constants';
import { useAlert } from 'dashboard/composables';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper';
import { useCallsStore } from 'dashboard/stores/calls';
import { useWhatsappCallSession } from 'dashboard/composables/useWhatsappCallSession';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';

const props = defineProps({
  phone: { type: String, default: '' },
  contactId: { type: [String, Number], required: true },
  // When set, the WhatsApp call continues in this conversation (matching the
  // header button) instead of looking up the contact's most recent one.
  conversationId: { type: [String, Number], default: null },
  label: { type: String, default: '' },
  icon: { type: [String, Object, Function], default: '' },
  size: { type: String, default: 'sm' },
  variant: { type: String, default: null },
  tooltipLabel: { type: String, default: '' },
});

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const { currentParams, visit } = useAppNavigation();
const store = useStore();

const { t } = useI18n();

const isDialogOpen = ref(false);

const buttonSize = computed(() => (props.label ? props.size : 'icon'));
const buttonVariant = computed(
  () => props.variant || (props.label ? 'default' : 'outline')
);

const callsStore = useCallsStore();
const inboxesList = useMapGetter('inboxes/getInboxes');
const contactsUiFlags = useMapGetter('contacts/getUIFlags');

const voiceInboxes = computed(() =>
  (inboxesList.value || []).filter(isVoiceCallEnabled)
);
const hasVoiceInboxes = computed(() => voiceInboxes.value.length > 0);
const conversationVoiceInbox = computed(() => {
  if (!props.conversationId) return null;

  const conversation = store.getters.getConversationById(props.conversationId);
  return voiceInboxes.value.find(inbox => inbox.id === conversation?.inbox_id);
});
const hasWhatsappConversationIdentity = computed(
  () =>
    getVoiceCallProvider(conversationVoiceInbox.value) ===
    VOICE_CALL_PROVIDERS.WHATSAPP
);

const shouldRender = computed(
  () =>
    hasVoiceInboxes.value &&
    (!!props.phone || hasWhatsappConversationIdentity.value)
);

const isInitiatingCall = computed(() => {
  return contactsUiFlags.value?.isInitiatingCall || false;
});

// Mirror the conversation-header button: block a new call whenever any provider
// call is already active or ringing, otherwise starting a WhatsApp call here
// would leave a still-live Twilio (or other) session with no visible control.
const isCallButtonDisabled = computed(
  () =>
    callsStore.hasActiveCall ||
    callsStore.hasIncomingCall ||
    isInitiatingCall.value
);

const navigateToConversation = conversationId => {
  const accountId = currentParams.value.accountId;
  if (conversationId && accountId) {
    const path = frontendURL(
      conversationUrl({
        accountId,
        id: conversationId,
      })
    );
    visit(path);
  }
};

const whatsappCallSession = useWhatsappCallSession();

const startWhatsappCall = async (inboxId, conversationIdHint) => {
  const response = await whatsappCallSession.initiateOutboundCall(
    conversationIdHint
      ? { conversationId: conversationIdHint }
      : { contactId: props.contactId, inboxId }
  );
  // The composable returns { status: 'locked' } when an init is already in
  // flight or a call is already active; treat that as a soft no-op rather than
  // claiming success.
  if (response?.status === VOICE_CALL_OUTBOUND_INIT_STATUS.LOCKED) return;

  const conversationId = response?.conversation_id || conversationIdHint;
  if (!response?.id) {
    // Permission template path returns no call id. Mirror the header button and
    // surface whether the request was just sent or is already pending instead of
    // claiming the call started. The permission message lands in the
    // conversation, so still navigate there.
    const messageKey =
      response?.status === VOICE_CALL_OUTBOUND_INIT_STATUS.PERMISSION_PENDING
        ? 'CONTACT_PANEL.WHATSAPP_CALL_PERMISSION_PENDING'
        : 'CONTACT_PANEL.WHATSAPP_CALL_PERMISSION_REQUESTED';
    useAlert(t(messageKey));
    navigateToConversation(conversationId);
    return;
  }

  // Stay non-active until the connect cable event arrives — flipping to active
  // here would start the duration timer before the contact picks up.
  callsStore.addCall({
    callSid: response.call_id,
    callId: response.id,
    conversationId,
    inboxId,
    callDirection: VOICE_CALL_DIRECTION.OUTBOUND,
    provider: VOICE_CALL_PROVIDERS.WHATSAPP,
  });

  useAlert(t('CONTACT_PANEL.CALL_INITIATED'));
  navigateToConversation(conversationId);
};

const startCall = async (inboxId, conversationIdHint = null) => {
  if (isCallButtonDisabled.value) return;

  const inbox = (inboxesList.value || []).find(i => i.id === inboxId);
  if (getVoiceCallProvider(inbox) === VOICE_CALL_PROVIDERS.WHATSAPP) {
    try {
      await startWhatsappCall(inboxId, conversationIdHint);
    } catch (error) {
      useAlert(
        error?.response?.data?.error ||
          error?.message ||
          t('CONTACT_PANEL.CALL_FAILED')
      );
    }
    return;
  }

  try {
    const response = await store.dispatch('contacts/initiateCall', {
      contactId: props.contactId,
      inboxId,
      conversationId: conversationIdHint,
    });
    const { call_sid: callSid, conversation_id: conversationId } = response;

    callsStore.addCall({
      callSid,
      conversationId,
      inboxId,
      callDirection: VOICE_CALL_DIRECTION.OUTBOUND,
    });

    useAlert(t('CONTACT_PANEL.CALL_INITIATED'));
    navigateToConversation(response?.conversation_id);
  } catch (error) {
    const apiError = error?.message;
    useAlert(apiError || t('CONTACT_PANEL.CALL_FAILED'));
  }
};

const onClick = async () => {
  // In conversation context, only stay in this conversation if its inbox is
  // itself voice-capable (works the same for Twilio and WhatsApp). For
  // non-voice channels (email, web, …) fall back to the picker so the call
  // goes out via a voice inbox.
  if (conversationVoiceInbox.value) {
    await startCall(conversationVoiceInbox.value.id, props.conversationId);
    return;
  }
  if (voiceInboxes.value.length > 1) {
    isDialogOpen.value = true;
    return;
  }
  const [inbox] = voiceInboxes.value;
  await startCall(inbox.id);
};

const onPickInbox = async inbox => {
  isDialogOpen.value = false;
  await startCall(inbox.id);
};
</script>

<template>
  <span class="contents">
    <Button
      v-if="shouldRender"
      v-tooltip.top-end="tooltipLabel || null"
      v-bind="attrs"
      :disabled="isCallButtonDisabled"
      :variant="buttonVariant"
      :size="buttonSize"
      @click="onClick"
    >
      <Spinner v-if="isInitiatingCall" class="size-4 flex-shrink-0" />
      <template v-else>
        <Icon v-if="icon" :icon="icon" class="size-4" />
        {{ label }}
      </template>
    </Button>

    <Dialog
      v-if="shouldRender && voiceInboxes.length > 1"
      :open="isDialogOpen"
      @update:open="
        val => {
          if (!val) isDialogOpen = false;
        }
      "
    >
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {{ $t('CONTACT_PANEL.VOICE_INBOX_PICKER.TITLE') }}
          </DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Button
            v-for="inbox in voiceInboxes"
            :key="inbox.id"
            variant="ghost"
            class="justify-between w-full h-auto px-4 py-2"
            @click="onPickInbox(inbox)"
          >
            <span class="flex items-center gap-2 min-w-0">
              <Icon icon="i-ri-phone-fill" class="size-4 text-n-slate-10" />
              <span class="text-sm truncate text-n-slate-12">
                {{ inbox.name }}
              </span>
            </span>
            <span v-if="inbox.phone_number" class="text-xs text-n-slate-10">
              {{ inbox.phone_number }}
            </span>
          </Button>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline">
              {{ t('DIALOG.BUTTONS.CANCEL') }}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </span>
</template>
