<script setup>
import { ref } from 'vue';
import ReportHeader from './components/ReportHeader.vue';
import SummaryReports from './components/SummaryReports.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const summarReportsRef = ref(null);

const onDownloadClick = () => {
  summarReportsRef.value.downloadReports();
};
</script>

<template>
  <ReportHeader
    :header-title="$t('AGENT_REPORTS.HEADER')"
    :header-description="$t('AGENT_REPORTS.DESCRIPTION')"
  >
    <Button @click="onDownloadClick">
      <Icon :icon="'i-ph-download-simple'" class="size-4" />
      {{ $t('AGENT_REPORTS.DOWNLOAD_AGENT_REPORTS') }}
    </Button>
  </ReportHeader>

  <SummaryReports
    ref="summarReportsRef"
    action-key="summaryReports/fetchAgentSummaryReports"
    getter-key="agents/getAgents"
    fetch-items-key="agents/get"
    summary-key="summaryReports/getAgentSummaryReports"
    type="agent"
  />
</template>
