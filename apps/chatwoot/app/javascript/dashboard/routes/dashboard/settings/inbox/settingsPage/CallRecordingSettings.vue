<script setup>
import { ref, watch } from 'vue';
import { useStore } from 'vuex';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import InboxesAPI from 'dashboard/api/inboxes';
import { Switch } from 'dashboard/components-next/ui/switch';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from 'dashboard/components-next/ui/item';

const props = defineProps({
  inbox: {
    type: Object,
    required: true,
  },
});

const store = useStore();
const { t } = useI18n();

const recordingEnabled = ref(props.inbox.recording_enabled !== false);
const transcriptionEnabled = ref(props.inbox.transcription_enabled !== false);
const isSaving = ref(false);

watch(
  () => [props.inbox.recording_enabled, props.inbox.transcription_enabled],
  ([recording, transcription]) => {
    recordingEnabled.value = recording !== false;
    transcriptionEnabled.value = transcription !== false;
  }
);

// Mirrors the inbound-calls toggle: apply optimistically, roll back if the save
// fails, so the switches never show a state the server didn't accept.
const save = async (recording, transcription) => {
  if (isSaving.value) return;
  const previous = [recordingEnabled.value, transcriptionEnabled.value];
  recordingEnabled.value = recording;
  transcriptionEnabled.value = transcription;
  isSaving.value = true;
  try {
    await InboxesAPI.setCallRecording(props.inbox.id, {
      recordingEnabled: recording,
      transcriptionEnabled: transcription,
    });
    await store.dispatch('inboxes/get', props.inbox.id);
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (_) {
    [recordingEnabled.value, transcriptionEnabled.value] = previous;
    useAlert(t('INBOX_MGMT.EDIT.API.ERROR_MESSAGE'));
  } finally {
    isSaving.value = false;
  }
};

const toggleRecording = value => save(value, transcriptionEnabled.value);

const toggleTranscription = value => save(recordingEnabled.value, value);
</script>

<template>
  <div
    class="flex flex-col gap-6"
    :class="{ 'pointer-events-none opacity-60': isSaving }"
  >
    <Item variant="outline" class="rounded-xl border-n-weak">
      <ItemContent>
        <ItemTitle class="text-n-slate-12">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.RECORDING.LABEL') }}
        </ItemTitle>
        <ItemDescription class="line-clamp-none text-n-slate-11">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.RECORDING.DESCRIPTION') }}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          :model-value="recordingEnabled"
          :disabled="isSaving"
          data-test="call-recording-toggle"
          @update:model-value="toggleRecording"
        />
      </ItemActions>
    </Item>
    <Item
      v-if="recordingEnabled"
      variant="outline"
      class="rounded-xl border-n-weak"
    >
      <ItemContent>
        <ItemTitle class="text-n-slate-12">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.TRANSCRIPTION.LABEL') }}
        </ItemTitle>
        <ItemDescription class="line-clamp-none text-n-slate-11">
          {{ $t('INBOX_MGMT.VOICE_CONFIGURATION.TRANSCRIPTION.DESCRIPTION') }}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          :model-value="transcriptionEnabled"
          :disabled="isSaving"
          data-test="call-transcription-toggle"
          @update:model-value="toggleTranscription"
        />
      </ItemActions>
    </Item>
  </div>
</template>
