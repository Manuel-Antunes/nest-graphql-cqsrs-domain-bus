<script setup>
import { computed } from 'vue';
import { useFunctionGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import WootReports from './components/WootReports.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const { currentParams } = useAppNavigation();
const team = useFunctionGetter(
  'teams/getTeamById',
  computed(() => currentParams.value.id)
);
</script>

<template>
  <WootReports
    v-if="team.id"
    :key="team.id"
    type="team"
    getter-key="teams/getTeams"
    action-key="teams/get"
    :selected-item="team"
    :download-button-label="$t('TEAM_REPORTS.DOWNLOAD_TEAM_REPORTS')"
    :report-title="$t('TEAM_REPORTS.HEADER')"
    has-back-button
  />
  <div v-else class="w-full py-20">
    <Spinner class="mx-auto size-6" />
  </div>
</template>
