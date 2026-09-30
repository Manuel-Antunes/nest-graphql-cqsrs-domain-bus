<script setup>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useBranding } from 'shared/composables/useBranding';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import { Button } from 'dashboard/components-next/ui/button';
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const props = defineProps({
  hasConnectedAChannel: {
    type: Boolean,
    default: true,
  },
});

const store = useStore();
const { t } = useI18n();

const { formatMessage } = useMessageFormatter();
const { replaceInstallationName } = useBranding();

const selectedChannelId = ref('');
const availableChannels = ref([]);

const uiFlags = computed(() => store.getters['integrations/getUIFlags']);

const errorDescription = computed(() => {
  return !props.hasConnectedAChannel
    ? t('INTEGRATION_SETTINGS.SLACK.SELECT_CHANNEL.DESCRIPTION')
    : t('INTEGRATION_SETTINGS.SLACK.SELECT_CHANNEL.EXPIRED');
});

const formattedErrorMessage = computed(() => {
  return formatMessage(replaceInstallationName(errorDescription.value), false);
});

const fetchChannels = async () => {
  try {
    availableChannels.value = await store.dispatch(
      'integrations/listAllSlackChannels'
    );
    availableChannels.value.sort((c1, c2) => c1.name - c2.name);
  } catch {
    t('INTEGRATION_SETTINGS.SLACK.FAILED_TO_FETCH_CHANNELS');
    availableChannels.value = [];
  }
};

const updateIntegration = async () => {
  try {
    await store.dispatch('integrations/updateSlack', {
      referenceId: selectedChannelId.value,
    });
    useAlert(t('INTEGRATION_SETTINGS.SLACK.UPDATE_SUCCESS'));
  } catch (error) {
    useAlert(error.message || 'INTEGRATION_SETTINGS.SLACK.UPDATE_ERROR');
  }
};
</script>

<template>
  <div
    class="px-6 py-4 mb-4 outline outline-n-container outline-1 bg-n-alpha-3 rounded-md shadow"
  >
    <div class="flex">
      <div class="flex-shrink-0">
        <div class="i-lucide-bell text-xl text-n-amber-11 mt-1" />
      </div>
      <div class="ml-3">
        <p class="mb-1 text-base font-semibold text-n-slate-12">
          {{
            $t('INTEGRATION_SETTINGS.SLACK.SELECT_CHANNEL.ATTENTION_REQUIRED')
          }}
        </p>
        <div class="mt-2 text-sm text-n-slate-11 mb-3">
          <p v-dompurify-html="formattedErrorMessage" />
        </div>
      </div>
    </div>
    <div v-if="!hasConnectedAChannel" class="mb-2 mt-1 ml-8">
      <Button
        v-if="!availableChannels.length"
        variant="default"
        class="bg-n-amber-9 text-white hover:bg-n-amber-10"
        :disabled="uiFlags.isFetchingSlackChannels"
        @click="fetchChannels"
      >
        <Spinner
          v-if="uiFlags.isFetchingSlackChannels"
          class="size-4 flex-shrink-0"
        />
        <template v-if="!uiFlags.isFetchingSlackChannels">
          {{ $t('INTEGRATION_SETTINGS.SLACK.SELECT_CHANNEL.BUTTON_TEXT') }}
        </template>
      </Button>
      <div v-else class="inline-flex items-center gap-3">
        <AsyncSelect
          :model-value="selectedChannelId"
          :options="availableChannels"
          :get-option-value="channel => channel.id"
          :get-option-label="channel => `#${channel.name}`"
          :placeholder="
            $t('INTEGRATION_SETTINGS.SLACK.SELECT_CHANNEL.OPTION_LABEL')
          "
          width="16rem"
          @update:model-value="v => (selectedChannelId = v)"
        />
        <Button
          variant="default"
          class="bg-n-teal-9 text-white hover:bg-n-teal-10"
          :disabled="uiFlags.isUpdatingSlack"
          @click="updateIntegration"
        >
          <Spinner
            v-if="uiFlags.isUpdatingSlack"
            class="size-4 flex-shrink-0"
          />
          <template v-if="!uiFlags.isUpdatingSlack">
            {{ $t('INTEGRATION_SETTINGS.SLACK.SELECT_CHANNEL.UPDATE') }}
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>
