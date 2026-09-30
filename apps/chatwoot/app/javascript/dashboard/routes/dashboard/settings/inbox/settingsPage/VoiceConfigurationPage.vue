<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import InboxesAPI from 'dashboard/api/inboxes';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Switch } from 'dashboard/components-next/ui/switch';
import {
  Field,
  FieldDescription,
  FieldLabel,
} from 'dashboard/components-next/ui/field';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from 'dashboard/components-next/ui/item';
import CallRecordingSettings from './CallRecordingSettings.vue';

const props = defineProps({
  inbox: {
    type: Object,
    default: () => ({}),
  },
});

const { t } = useI18n();
const store = useStore();

const voiceEnabled = ref(props.inbox.voice_enabled || false);
const inboundCallsEnabled = ref(props.inbox.inbound_calls_enabled !== false);
const apiKeySid = ref(props.inbox.api_key_sid || '');
const apiKeySecret = ref('');
const isUpdating = ref(false);
const isTogglingInbound = ref(false);

const isVoiceConfigured = computed(() => !!props.inbox.voice_configured);
const hasApiKeySid = computed(() => !!props.inbox.api_key_sid);
const hasExistingCredentials = computed(
  () => hasApiKeySid.value && !!props.inbox.has_api_key_secret
);
const needsCredentials = computed(
  () =>
    voiceEnabled.value &&
    !isVoiceConfigured.value &&
    !hasExistingCredentials.value
);
const needsApiKeySid = computed(
  () => needsCredentials.value && !hasApiKeySid.value
);
const isSubmitDisabled = computed(() => {
  if (!voiceEnabled.value) return false;
  if (needsCredentials.value) {
    if (needsApiKeySid.value && !apiKeySid.value) return true;
    return !apiKeySecret.value;
  }
  return false;
});

watch(
  () => props.inbox.voice_enabled,
  val => {
    voiceEnabled.value = val || false;
  }
);
watch(
  () => props.inbox.api_key_sid,
  val => {
    apiKeySid.value = val || '';
  }
);
watch(
  () => props.inbox.inbound_calls_enabled,
  val => {
    inboundCallsEnabled.value = val !== false;
  }
);

const handleInboundToggle = async newValue => {
  if (isTogglingInbound.value) return;
  const previousValue = inboundCallsEnabled.value;
  inboundCallsEnabled.value = newValue;
  isTogglingInbound.value = true;
  try {
    await InboxesAPI.setInboundCalls(props.inbox.id, newValue);
    await store.dispatch('inboxes/get', props.inbox.id);
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (_) {
    inboundCallsEnabled.value = previousValue;
    useAlert(t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE'));
  } finally {
    isTogglingInbound.value = false;
  }
};

const updateVoiceSettings = async () => {
  isUpdating.value = true;
  try {
    const channelPayload = { voice_enabled: voiceEnabled.value };

    if (needsCredentials.value) {
      if (needsApiKeySid.value) {
        channelPayload.api_key_sid = apiKeySid.value;
      }
      channelPayload.api_key_secret = apiKeySecret.value;
    }

    await store.dispatch('inboxes/updateInbox', {
      id: props.inbox.id,
      formData: false,
      channel: channelPayload,
    });
    apiKeySecret.value = '';
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE'));
    throw error;
  } finally {
    isUpdating.value = false;
  }
};

// Saves on toggle, except when enabling still needs API key credentials: then we
// reveal the inputs and wait for the user to submit them.
const handleVoiceToggle = async newValue => {
  if (isUpdating.value) return;
  const previousValue = voiceEnabled.value;
  voiceEnabled.value = newValue;

  if (needsCredentials.value) return;

  try {
    await updateVoiceSettings();
  } catch (_) {
    voiceEnabled.value = previousValue;
  }
};

const submitVoiceCredentials = async () => {
  try {
    await updateVoiceSettings();
  } catch (_) {
    voiceEnabled.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <Item
      variant="outline"
      class="rounded-xl border-n-weak"
      :class="{ 'pointer-events-none opacity-60': isUpdating }"
    >
      <ItemContent>
        <ItemTitle class="text-n-slate-12">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.ENABLE_VOICE.LABEL') }}
        </ItemTitle>
        <ItemDescription class="line-clamp-none text-n-slate-11">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.ENABLE_VOICE.DESCRIPTION') }}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Spinner v-if="isUpdating" class="size-4 text-n-slate-11" />
        <Switch
          v-else
          :model-value="voiceEnabled"
          data-test="voice-enabled-toggle"
          @update:model-value="handleVoiceToggle"
        />
      </ItemActions>
    </Item>

    <div v-if="voiceEnabled && needsCredentials" class="flex flex-col gap-4">
      <p class="text-sm text-n-slate-11">
        {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.CREDENTIALS.DESCRIPTION') }}
      </p>
      <Field v-if="needsApiKeySid">
        <FieldLabel for="voice-api-key-sid">
          {{ $t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SID.LABEL') }}
        </FieldLabel>
        <Input
          id="voice-api-key-sid"
          v-model="apiKeySid"
          :placeholder="
            $t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SID.PLACEHOLDER')
          "
        />
      </Field>
      <Field>
        <FieldLabel for="voice-api-key-secret">
          {{ $t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SECRET.LABEL') }}
        </FieldLabel>
        <Input
          id="voice-api-key-secret"
          v-model="apiKeySecret"
          type="password"
          :placeholder="
            $t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SECRET.PLACEHOLDER')
          "
        />
      </Field>
    </div>

    <Item
      v-if="inbox.voice_enabled"
      variant="outline"
      class="rounded-xl border-n-weak"
      :class="{ 'pointer-events-none opacity-60': isTogglingInbound }"
    >
      <ItemContent>
        <ItemTitle class="text-n-slate-12">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.INBOUND.LABEL') }}
        </ItemTitle>
        <ItemDescription class="line-clamp-none text-n-slate-11">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.INBOUND.DESCRIPTION') }}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Spinner v-if="isTogglingInbound" class="size-4 text-n-slate-11" />
        <Switch
          v-else
          :model-value="inboundCallsEnabled"
          data-test="inbound-calls-toggle"
          @update:model-value="handleInboundToggle"
        />
      </ItemActions>
    </Item>

    <CallRecordingSettings v-if="inbox.voice_enabled" :inbox="inbox" />

    <div
      v-if="inbox.voice_enabled && inbox.voice_call_webhook_url"
      class="flex flex-col gap-6"
    >
      <Field>
        <FieldLabel>
          {{ $t('INBOX_MGMT.ADD.VOICE.CONFIGURATION.TWILIO_VOICE_URL_TITLE') }}
        </FieldLabel>
        <woot-code :script="inbox.voice_call_webhook_url" lang="html" />
        <FieldDescription>
          {{
            $t('INBOX_MGMT.ADD.VOICE.CONFIGURATION.TWILIO_VOICE_URL_SUBTITLE')
          }}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>
          {{ $t('INBOX_MGMT.ADD.VOICE.CONFIGURATION.TWILIO_STATUS_URL_TITLE') }}
        </FieldLabel>
        <woot-code :script="inbox.voice_status_webhook_url" lang="html" />
        <FieldDescription>
          {{
            $t('INBOX_MGMT.ADD.VOICE.CONFIGURATION.TWILIO_STATUS_URL_SUBTITLE')
          }}
        </FieldDescription>
      </Field>
    </div>

    <div v-if="needsCredentials">
      <Button
        :disabled="isSubmitDisabled || isUpdating"
        data-test="voice-credentials-submit"
        @click="submitVoiceCredentials"
      >
        <Spinner v-if="isUpdating" class="size-4" />
        {{ $t('INBOX_MGMT.SETTINGS_POPUP.UPDATE') }}
      </Button>
    </div>
  </div>
</template>
