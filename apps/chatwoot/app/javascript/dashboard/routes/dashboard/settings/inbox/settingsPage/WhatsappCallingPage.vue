<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import InboxesAPI from 'dashboard/api/inboxes';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Switch } from 'dashboard/components-next/ui/switch';
import { Textarea } from 'dashboard/components-next/ui/textarea';
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

const callingEnabled = ref(
  props.inbox.provider_config?.calling_enabled || false
);
const inboundCallsEnabled = ref(
  props.inbox.provider_config?.inbound_calls_enabled !== false
);
const permissionRequestBody = ref(
  props.inbox.provider_config?.call_permission_request_body || ''
);
const isUpdating = ref(false);
const isTogglingCalling = ref(false);
const isTogglingInbound = ref(false);

const phoneNumber = computed(
  () => props.inbox.provider_config?.phone_number || props.inbox.phone_number
);

watch(
  () => props.inbox.provider_config?.calling_enabled,
  val => {
    callingEnabled.value = val || false;
  }
);
watch(
  () => props.inbox.provider_config?.call_permission_request_body,
  val => {
    permissionRequestBody.value = val || '';
  }
);
watch(
  () => props.inbox.provider_config?.inbound_calls_enabled,
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

const handleCallingToggle = async newValue => {
  if (isTogglingCalling.value) return;
  const previousValue = callingEnabled.value;
  callingEnabled.value = newValue;
  isTogglingCalling.value = true;
  try {
    if (newValue) {
      await InboxesAPI.enableWhatsappCalling(props.inbox.id);
    } else {
      await InboxesAPI.disableWhatsappCalling(props.inbox.id);
    }
    await store.dispatch('inboxes/get', props.inbox.id);
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (_) {
    callingEnabled.value = previousValue;
    useAlert(
      newValue
        ? t('INBOX_MGMT.WHATSAPP_CALLING.ENABLE_FAILED')
        : t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE')
    );
  } finally {
    isTogglingCalling.value = false;
  }
};

const updateCallingSettings = async () => {
  isUpdating.value = true;
  try {
    await store.dispatch('inboxes/updateInbox', {
      id: props.inbox.id,
      formData: false,
      channel: {
        provider_config: {
          ...props.inbox.provider_config,
          call_permission_request_body:
            permissionRequestBody.value.trim() || null,
        },
      },
    });
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(
      error?.response?.data?.message || t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE')
    );
  } finally {
    isUpdating.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <Item
      variant="outline"
      class="rounded-xl border-n-weak"
      :class="{ 'pointer-events-none opacity-60': isTogglingCalling }"
    >
      <ItemContent>
        <ItemTitle class="text-n-slate-12">
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.ENABLE.LABEL') }}
        </ItemTitle>
        <ItemDescription class="line-clamp-none text-n-slate-11">
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.ENABLE.DESCRIPTION') }}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Spinner v-if="isTogglingCalling" class="size-4 text-n-slate-11" />
        <Switch
          v-else
          :model-value="callingEnabled"
          data-test="whatsapp-calling-toggle"
          @update:model-value="handleCallingToggle"
        />
      </ItemActions>
    </Item>

    <template v-if="callingEnabled">
      <Item
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

      <CallRecordingSettings :inbox="inbox" />

      <Field v-if="phoneNumber">
        <FieldLabel>
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.PHONE_NUMBER.LABEL') }}
        </FieldLabel>
        <woot-code :script="phoneNumber" lang="html" />
        <FieldDescription>
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.PHONE_NUMBER.HELP_TEXT') }}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel for="whatsapp-call-permission-body">
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.PERMISSION_REQUEST_BODY.LABEL') }}
        </FieldLabel>
        <Textarea
          id="whatsapp-call-permission-body"
          v-model="permissionRequestBody"
          class="min-h-24"
          :placeholder="
            $t(
              'INBOX_MGMT.WHATSAPP_CALLING.PERMISSION_REQUEST_BODY.PLACEHOLDER'
            )
          "
        />
        <FieldDescription>
          {{
            $t('INBOX_MGMT.WHATSAPP_CALLING.PERMISSION_REQUEST_BODY.HELP_TEXT')
          }}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.HOW_IT_WORKS.LABEL') }}
        </FieldLabel>
        <FieldDescription>
          {{ $t('INBOX_MGMT.WHATSAPP_CALLING.HOW_IT_WORKS.DESCRIPTION') }}
        </FieldDescription>
      </Field>

      <div>
        <Button
          :disabled="isUpdating"
          data-test="whatsapp-calling-submit"
          @click="updateCallingSettings"
        >
          <Spinner v-if="isUpdating" class="size-4" />
          {{ $t('INBOX_MGMT.SETTINGS_POPUP.UPDATE') }}
        </Button>
      </div>
    </template>
  </div>
</template>
