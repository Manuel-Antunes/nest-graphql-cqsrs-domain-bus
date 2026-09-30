<script setup>
import { computed, onMounted } from 'vue';
import { useFunctionGetter, useStore } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import WootReports from './components/WootReports.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const { currentParams } = useAppNavigation();
const store = useStore();
const agent = useFunctionGetter(
  'agents/getAgentById',
  computed(() => currentParams.value.id)
);

onMounted(() => store.dispatch('agents/get'));
</script>

<template>
  <WootReports
    v-if="agent.id"
    :key="agent.id"
    type="agent"
    getter-key="agents/getAgents"
    action-key="agents/get"
    :selected-item="agent"
    :download-button-label="$t('AGENT_REPORTS.DOWNLOAD_AGENT_REPORTS')"
    :report-title="$t('AGENT_REPORTS.HEADER')"
    has-back-button
  />
  <div v-else class="w-full py-20">
    <Spinner class="mx-auto size-6" />
  </div>
</template>
