<script setup>
import { ref, computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import PageHeader from '../../SettingsSubPageHeader.vue';
import AgentSelector from '../AgentSelector.vue';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const store = useStore();
const { currentParams, visit } = useAppNavigation();
const { t } = useI18n();

const agentList = useMapGetter('agents/getAgents');

const isCreating = ref(false);

const teamId = computed(() => currentParams.value.teamId);
const currentTeam = computed(() =>
  store.getters['teams/getTeam'](teamId.value)
);
const headerTitle = computed(() =>
  t('TEAMS_SETTINGS.ADD.TITLE', { teamName: currentTeam.value.name })
);

const validationSchema = toTypedSchema(
  z.object({
    selectedAgents: z
      .array(z.any())
      .min(1, t('TEAMS_SETTINGS.ADD.AGENT_VALIDATION_ERROR')),
  })
);

const initialValues = { selectedAgents: [] };

store.dispatch('agents/get');

const addAgents = async values => {
  isCreating.value = true;
  try {
    await store.dispatch('teamMembers/create', {
      teamId: teamId.value,
      agentsList: values.selectedAgents,
    });
    visit({
      name: 'settings_teams_finish',
      params: {
        page: 'new',
        teamId: teamId.value,
      },
    });
    store.dispatch('teams/get');
  } catch (error) {
    useAlert(error.message);
  }
  isCreating.value = false;
};
</script>

<template>
  <div class="h-full w-full px-8 pt-8 col-span-6 overflow-auto">
    <Form
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-col gap-4 mx-0"
      @submit="addAgents"
    >
      <PageHeader
        :header-title="headerTitle"
        :header-content="$t('TEAMS_SETTINGS.ADD.DESC')"
      />

      <FormField
        v-slot="{ value, handleChange, errorMessage }"
        name="selectedAgents"
      >
        <div class="w-full h-full">
          <p v-if="errorMessage" class="error-message pb-2">
            {{ errorMessage }}
          </p>
          <AgentSelector
            :agent-list="agentList"
            :selected-agents="value"
            :update-selected-agents="handleChange"
            :is-working="isCreating"
            :submit-button-text="$t('TEAMS_SETTINGS.ADD.BUTTON_TEXT')"
          />
        </div>
      </FormField>
    </Form>
  </div>
</template>
