<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import { Spinner } from 'dashboard/components-next/ui/spinner';
import PageHeader from '../../SettingsSubPageHeader.vue';
import AgentSelector from '../AgentSelector.vue';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const store = useStore();
const { currentParams, visit } = useAppNavigation();
const { t } = useI18n();

const editAgentsForm = ref(null);
const isCreating = ref(false);

const agentList = useMapGetter('agents/getAgents');
const uiFlags = useMapGetter('teamMembers/getUIFlags');

const teamId = computed(() => currentParams.value.teamId);
const currentTeam = computed(() =>
  store.getters['teams/getTeam'](teamId.value)
);
const teamMembers = computed(() =>
  store.getters['teamMembers/getTeamMembers'](teamId.value)
);
const headerTitle = computed(() =>
  t('TEAMS_SETTINGS.EDIT_FLOW.AGENTS.TITLE', {
    teamName: currentTeam.value.name,
  })
);
const showAgentsList = computed(
  () => currentTeam.value.id && !uiFlags.value.isFetching
);

const validationSchema = toTypedSchema(
  z.object({
    selectedAgents: z
      .array(z.any())
      .min(1, t('TEAMS_SETTINGS.ADD.AGENT_VALIDATION_ERROR')),
  })
);

const initialValues = { selectedAgents: [] };

onMounted(async () => {
  store.dispatch('agents/get');
  try {
    await store.dispatch('teamMembers/get', { teamId: teamId.value });
    editAgentsForm.value?.setValues({
      selectedAgents: teamMembers.value.map(item => item.id),
    });
  } catch {
    editAgentsForm.value?.setValues({ selectedAgents: [] });
  }
});

const addAgents = async values => {
  isCreating.value = true;
  try {
    await store.dispatch('teamMembers/update', {
      teamId: teamId.value,
      agentsList: values.selectedAgents,
    });
    visit({
      name: 'settings_teams_edit_finish',
      params: {
        page: 'edit',
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
      ref="editAgentsForm"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-col gap-4 mx-0"
      @submit="addAgents"
    >
      <PageHeader
        :header-title="headerTitle"
        :header-content="$t('TEAMS_SETTINGS.EDIT_FLOW.AGENTS.DESC')"
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
            v-if="showAgentsList"
            :agent-list="agentList"
            :selected-agents="value"
            :update-selected-agents="handleChange"
            :is-working="isCreating"
            :submit-button-text="
              $t('TEAMS_SETTINGS.EDIT_FLOW.AGENTS.BUTTON_TEXT')
            "
          />
          <div v-else class="flex items-center justify-center py-6">
            <Spinner class="size-6 text-n-blue-11" />
          </div>
        </div>
      </FormField>
    </Form>
  </div>
</template>
