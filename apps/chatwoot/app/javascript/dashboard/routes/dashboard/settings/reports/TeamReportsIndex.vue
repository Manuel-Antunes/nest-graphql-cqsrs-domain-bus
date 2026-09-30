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
    :header-title="$t('TEAM_REPORTS.HEADER')"
    :header-description="$t('TEAM_REPORTS.DESCRIPTION')"
  >
    <Button @click="onDownloadClick">
      <Icon :icon="'i-ph-download-simple'" class="size-4" />
      {{ $t('TEAM_REPORTS.DOWNLOAD_TEAM_REPORTS') }}
    </Button>
  </ReportHeader>

  <SummaryReports
    ref="summarReportsRef"
    action-key="summaryReports/fetchTeamSummaryReports"
    getter-key="teams/getTeams"
    fetch-items-key="teams/get"
    summary-key="summaryReports/getTeamSummaryReports"
    type="team"
  />
</template>
