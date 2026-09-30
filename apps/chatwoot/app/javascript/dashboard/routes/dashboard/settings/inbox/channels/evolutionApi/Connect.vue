<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import { useAlert } from 'dashboard/composables';
import InboxesAPI from 'dashboard/api/inboxes';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const props = defineProps({
  inbox: {
    type: Object,
    required: true,
  },
});
const QR_POLL_INTERVAL_MS = 30_000;
const STATE_POLL_INTERVAL_MS = 3_000;

const { t } = useI18n();
const store = useStore();

const qrCode = ref(null);
const pairingCode = ref(null);
const isStarting = ref(false);
const isPolling = ref(false);

const connectionState = ref(
  props.inbox.additional_attributes?.connection_state || 'unknown'
);

let qrTimer = null;
let stateTimer = null;

const isConnected = computed(() => connectionState.value === 'open');

const statusLabel = computed(() => {
  const key = `INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.STATE_${connectionState.value.toUpperCase()}`;
  return t(key);
});

const stopPolling = () => {
  if (qrTimer) {
    clearInterval(qrTimer);
    qrTimer = null;
  }
  if (stateTimer) {
    clearInterval(stateTimer);
    stateTimer = null;
  }
  isPolling.value = false;
};

const refreshInbox = async () => {
  try {
    await store.dispatch('inboxes/get', props.inbox.id);
  } catch (_) {
    // best-effort refresh — surfaced state already reflects polling result
  }
};

const pollConnectionState = async () => {
  try {
    const { data } = await InboxesAPI.evolutionConnectionState(props.inbox.id);
    connectionState.value = data.state || 'unknown';
    if (isConnected.value) {
      stopPolling();
      qrCode.value = null;
      pairingCode.value = null;
      await refreshInbox();
      useAlert(
        t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.CONNECTED')
      );
    }
  } catch (error) {
    // keep polling on transient errors
  }
};

const fetchQrCode = async () => {
  try {
    const { data } = await InboxesAPI.evolutionConnect(props.inbox.id);
    qrCode.value = data.base64 || null;
    pairingCode.value = data.pairingCode || null;
  } catch (error) {
    useAlert(
      error?.response?.data?.error ||
        t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.QR_ERROR')
    );
    stopPolling();
  }
};

const startConnection = async () => {
  isStarting.value = true;
  try {
    await fetchQrCode();
    await pollConnectionState();
    if (isConnected.value) return;

    isPolling.value = true;
    qrTimer = setInterval(fetchQrCode, QR_POLL_INTERVAL_MS);
    stateTimer = setInterval(pollConnectionState, STATE_POLL_INTERVAL_MS);
  } finally {
    isStarting.value = false;
  }
};

onBeforeUnmount(stopPolling);
</script>

<template>
  <div class="flex flex-col gap-4 max-w-3xl">
    <div class="flex items-center gap-2">
      <span class="text-sm text-n-slate-11">
        {{
          $t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.STATUS_LABEL')
        }}
      </span>
      <span
        class="inline-flex items-center gap-1 text-sm font-medium"
        :class="
          isConnected
            ? 'text-n-teal-11'
            : connectionState === 'connecting'
              ? 'text-n-amber-11'
              : 'text-n-ruby-11'
        "
      >
        <span
          class="w-2 h-2 rounded-full"
          :class="
            isConnected
              ? 'bg-n-teal-9'
              : connectionState === 'connecting'
                ? 'bg-n-amber-9'
                : 'bg-n-ruby-9'
          "
        />
        {{ statusLabel }}
      </span>
    </div>

    <div v-if="qrCode && !isConnected" class="flex flex-col gap-2">
      <img
        :src="qrCode"
        :alt="$t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.QR_ALT')"
        class="w-64 h-64 border border-n-slate-5 rounded bg-white"
      />
      <p v-if="pairingCode" class="text-sm text-n-slate-11">
        {{
          $t(
            'INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.PAIRING_CODE',
            { code: pairingCode }
          )
        }}
      </p>
      <p class="text-xs text-n-slate-10">
        {{ $t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.QR_HINT') }}
      </p>
    </div>

    <div class="flex gap-2">
      <Button
        v-if="!isConnected"
        variant="default"
        :disabled="isPolling || isStarting"
        @click="startConnection"
      >
        <Spinner v-if="isStarting" class="size-4 flex-shrink-0" />
        <template v-if="!isStarting">
          {{
            isPolling
              ? $t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.POLLING')
              : $t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.CONNECT')
          }}
        </template>
      </Button>
      <Button
        v-if="isPolling && !isConnected"
        variant="outline"
        @click="stopPolling"
      >
        {{
          $t('INBOX_MGMT.SETTINGS_POPUP.EVOLUTION_API.CONNECTION.STOP_POLLING')
        }}
      </Button>
    </div>
  </div>
</template>
