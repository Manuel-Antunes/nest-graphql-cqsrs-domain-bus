<script setup>
import { computed, onMounted } from 'vue';
import { useFunctionGetter, useStore } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import WootReports from './components/WootReports.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const { currentParams } = useAppNavigation();
const store = useStore();
const label = useFunctionGetter(
  'labels/getLabelById',
  computed(() => currentParams.value.id)
);

onMounted(() => store.dispatch('labels/get'));
</script>

<template>
  <WootReports
    v-if="label.id"
    :key="label.id"
    type="label"
    getter-key="labels/getLabels"
    action-key="labels/get"
    :selected-item="label"
    :download-button-label="$t('LABEL_REPORTS.DOWNLOAD_LABEL_REPORTS')"
    :report-title="$t('LABEL_REPORTS.HEADER')"
    has-back-button
  />
  <div v-else class="w-full py-20">
    <Spinner class="mx-auto size-6" />
  </div>
</template>
