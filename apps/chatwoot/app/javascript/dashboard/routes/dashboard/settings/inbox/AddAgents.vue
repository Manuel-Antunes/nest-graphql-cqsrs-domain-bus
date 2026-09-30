<script setup>
import { ref } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import InboxMembersAPI from '../../../../api/inboxMembers';
import { Button } from 'dashboard/components-next/ui/button';
import { Label } from 'dashboard/components-next/ui/label';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import TagInput from 'dashboard/components-next/taginput/TagInput.vue';
import PageHeader from '../SettingsSubPageHeader.vue';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const store = useStore();
const { currentParams, visit } = useAppNavigation();
const { t } = useI18n();

const agentList = useMapGetter('agents/getAgents');

const isCreating = ref(false);

const validationSchema = toTypedSchema(
  z.object({
    selectedAgentIds: z
      .array(z.any())
      .min(1, t('INBOX_MGMT.ADD.AGENTS.VALIDATION_ERROR')),
  })
);

const initialValues = { selectedAgentIds: [] };

store.dispatch('agents/get');

const selectedAgentNames = selectedAgentIds =>
  selectedAgentIds.map(
    id => agentList.value.find(agent => agent.id === id)?.name ?? ''
  );

const agentMenuItems = selectedAgentIds =>
  agentList.value
    .filter(({ id }) => !selectedAgentIds.includes(id))
    .map(({ id, name, thumbnail, avatar_url }) => ({
      label: name,
      value: id,
      action: 'select',
      thumbnail: { name, src: thumbnail || avatar_url || '' },
    }));

const withAgentAdded = (selectedAgentIds, { value }) =>
  selectedAgentIds.includes(value)
    ? selectedAgentIds
    : [...selectedAgentIds, value];

const withAgentRemoved = (selectedAgentIds, index) =>
  selectedAgentIds.filter((_, position) => position !== index);

const addAgents = async values => {
  isCreating.value = true;
  const inboxId = currentParams.value.inbox_id;

  try {
    await InboxMembersAPI.update({
      inboxId,
      agentList: values.selectedAgentIds,
    });
    visit({
      name: 'settings_inbox_finish',
      params: {
        page: 'new',
        inbox_id: currentParams.value.inbox_id,
      },
    });
  } catch (error) {
    useAlert(error.message);
  }
  isCreating.value = false;
};
</script>

<template>
  <div class="h-full w-full p-6 col-span-6">
    <Form
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-wrap flex-col mx-0"
      @submit="addAgents"
    >
      <div class="w-full">
        <PageHeader
          :header-title="$t('INBOX_MGMT.ADD.AGENTS.TITLE')"
          :header-content="$t('INBOX_MGMT.ADD.AGENTS.DESC')"
        />
      </div>
      <div>
        <FormField
          v-slot="{ value, handleChange, errorMessage }"
          name="selectedAgentIds"
        >
          <div class="w-full mb-4">
            <Label>{{ $t('INBOX_MGMT.ADD.AGENTS.TITLE') }}</Label>
            <div
              data-testid="agent-selector"
              class="rounded-xl outline outline-1 -outline-offset-1 outline-n-weak hover:outline-n-strong px-2 py-2"
            >
              <TagInput
                :model-value="selectedAgentNames(value)"
                :placeholder="$t('INBOX_MGMT.ADD.AGENTS.PICK_AGENTS')"
                :menu-items="agentMenuItems(value)"
                show-dropdown
                skip-label-dedup
                @add="handleChange(withAgentAdded(value, $event))"
                @remove="handleChange(withAgentRemoved(value, $event))"
              />
            </div>
            <span v-if="errorMessage" class="message">
              {{ errorMessage }}
            </span>
          </div>
        </FormField>
        <div class="w-full">
          <Button type="submit" :disabled="isCreating">
            <Spinner v-if="isCreating" class="size-4 flex-shrink-0" />
            <template v-if="!isCreating">
              {{ $t('INBOX_MGMT.AGENTS.BUTTON_TEXT') }}
            </template>
          </Button>
        </div>
      </div>
    </Form>
  </div>
</template>
