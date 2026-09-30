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
    :header-title="$t('LABEL_REPORTS.HEADER')"
    :header-description="$t('LABEL_REPORTS.DESCRIPTION')"
  >
    <Button
      variant="default"
      @click="onDownloadClick"
    >
      <Icon :icon="'i-ph-download-simple'" class="size-4" />
      {{ $t('LABEL_REPORTS.DOWNLOAD_LABEL_REPORTS') }}
    </Button>
  </ReportHeader>

  <SummaryReports
    ref="summarReportsRef"
    action-key="summaryReports/fetchLabelSummaryReports"
    getter-key="labels/getLabels"
    fetch-items-key="labels/get"
    summary-key="summaryReports/getLabelSummaryReports"
    type="label"
  />
</template>
