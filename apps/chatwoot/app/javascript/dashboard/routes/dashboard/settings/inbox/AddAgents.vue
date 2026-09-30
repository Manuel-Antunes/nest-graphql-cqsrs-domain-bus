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
import PageHeader from '../SettingsSubPageHeader.vue';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const store = useStore();
const { currentParams, visit } = useAppNavigation();
const { t } = useI18n();

const agentList = useMapGetter('agents/getAgents');

const isCreating = ref(false);

const validationSchema = toTypedSchema(
  z.object({
    selectedAgents: z
      .array(z.any())
      .min(1, t('INBOX_MGMT.ADD.AGENTS.VALIDATION_ERROR')),
  })
);

const initialValues = { selectedAgents: [] };

store.dispatch('agents/get');

const addAgents = async values => {
  isCreating.value = true;
  const inboxId = currentParams.value.inbox_id;
  const selectedAgents = values.selectedAgents.map(x => x.id);

  try {
    await InboxMembersAPI.update({ inboxId, agentList: selectedAgents });
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
          name="selectedAgents"
        >
          <div class="w-full">
            <Label>{{ $t('INBOX_MGMT.ADD.AGENTS.TITLE') }}</Label>
            <multiselect
              :model-value="value"
              :options="agentList"
              track-by="id"
              label="name"
              multiple
              :close-on-select="false"
              :clear-on-select="false"
              hide-selected
              selected-label
              :select-label="$t('FORMS.MULTISELECT.ENTER_TO_SELECT')"
              :deselect-label="$t('FORMS.MULTISELECT.ENTER_TO_REMOVE')"
              :placeholder="$t('INBOX_MGMT.ADD.AGENTS.PICK_AGENTS')"
              @update:model-value="handleChange"
            />
            <span v-if="errorMessage" class="message">
              {{ errorMessage }}
            </span>
          </div>
        </FormField>
        <div class="w-full">
          <Button type="submit" :disabled="isCreating">
            <Spinner v-if="isCreating" class="size-4 flex-shrink-0" />
            <template v-if="!isCreating">{{
              $t('INBOX_MGMT.AGENTS.BUTTON_TEXT')
            }}</template>
          </Button>
        </div>
      </div>
    </Form>
  </div>
</template>
