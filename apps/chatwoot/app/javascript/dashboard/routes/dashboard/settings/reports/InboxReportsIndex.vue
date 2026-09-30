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
    :header-title="$t('INBOX_REPORTS.HEADER')"
    :header-description="$t('INBOX_REPORTS.DESCRIPTION')"
  >
    <Button
      variant="default"
      @click="onDownloadClick"
    >
      <Icon :icon="'i-ph-download-simple'" class="size-4" />
      {{ $t('INBOX_REPORTS.DOWNLOAD_INBOX_REPORTS') }}
    </Button>
  </ReportHeader>

  <SummaryReports
    ref="summarReportsRef"
    action-key="summaryReports/fetchInboxSummaryReports"
    getter-key="inboxes/getInboxes"
    fetch-items-key="inboxes/get"
    summary-key="summaryReports/getInboxSummaryReports"
    type="inbox"
  />
</template>
