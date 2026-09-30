<script setup>
import { computed } from 'vue';
import { useFunctionGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import WootReports from './components/WootReports.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const { currentParams } = useAppNavigation();
const inbox = useFunctionGetter(
  'inboxes/getInboxById',
  computed(() => currentParams.value.id)
);
</script>

<template>
  <WootReports
    v-if="inbox.id"
    :key="inbox.id"
    type="inbox"
    getter-key="inboxes/getInboxes"
    action-key="inboxes/get"
    :selected-item="inbox"
    :download-button-label="$t('INBOX_REPORTS.DOWNLOAD_INBOX_REPORTS')"
    :report-title="$t('INBOX_REPORTS.HEADER')"
    has-back-button
  />
  <div v-else class="w-full py-20">
    <Spinner class="mx-auto size-6" />
  </div>
</template>
