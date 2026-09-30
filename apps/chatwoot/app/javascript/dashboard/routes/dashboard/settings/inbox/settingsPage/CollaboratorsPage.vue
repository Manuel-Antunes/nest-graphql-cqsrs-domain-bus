<script setup>
import { ref, onMounted, watch } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useConfig } from 'dashboard/composables/useConfig';
import SettingsSection from '../../../../../components/SettingsSection.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  inbox: {
    type: Object,
    default: () => ({}),
  },
});

const store = useStore();
const { t } = useI18n();
const { isEnterprise } = useConfig();

const agentList = useMapGetter('agents/getAgents');

const selectedAgents = ref([]);
const isAgentListUpdating = ref(false);
const autoAssignForm = ref(null);

const validationSchema = toTypedSchema(
  z.object({
    enableAutoAssignment: z.boolean(),
    maxAssignmentLimit: z
      .any()
      .refine(
        value => value === null || value === '' || Number(value) >= 1,
        t('INBOX_MGMT.AUTO_ASSIGNMENT.MAX_ASSIGNMENT_LIMIT_RANGE_ERROR')
      ),
  })
);

const initialValues = {
  enableAutoAssignment: false,
  maxAssignmentLimit: null,
};

const fetchAttachedAgents = async () => {
  try {
    const response = await store.dispatch('inboxMembers/get', {
      inboxId: props.inbox.id,
    });
    const {
      data: { payload: inboxMembers },
    } = response;
    selectedAgents.value = inboxMembers;
  } catch (error) {
    //  Handle error
  }
};

const setDefaults = () => {
  autoAssignForm.value?.setValues({
    enableAutoAssignment: props.inbox.enable_auto_assignment || false,
    maxAssignmentLimit:
      props.inbox?.auto_assignment_config?.max_assignment_limit || null,
  });
  fetchAttachedAgents();
};

onMounted(setDefaults);
watch(() => props.inbox, setDefaults);

const updateAgents = async () => {
  const agentIds = selectedAgents.value.map(el => el.id);
  isAgentListUpdating.value = true;
  try {
    await store.dispatch('inboxMembers/create', {
      inboxId: props.inbox.id,
      agentList: agentIds,
    });
    useAlert(t('AGENT_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('AGENT_MGMT.EDIT.API.ERROR_MESSAGE'));
  }
  isAgentListUpdating.value = false;
};

const updateInbox = async ({ enableAutoAssignment, maxAssignmentLimit }) => {
  try {
    await store.dispatch('inboxes/updateInbox', {
      id: props.inbox.id,
      formData: false,
      enable_auto_assignment: enableAutoAssignment,
      auto_assignment_config: {
        max_assignment_limit: maxAssignmentLimit,
      },
    });
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('INBOX_MGMT.EDIT.API.SUCCESS_MESSAGE'));
  }
};

const onToggleAutoAssignment = (checked, handleChange, values) => {
  handleChange(checked);
  updateInbox({
    enableAutoAssignment: checked,
    maxAssignmentLimit: values.maxAssignmentLimit,
  });
};

const onSubmitAutoAssignment = values => {
  updateInbox({
    enableAutoAssignment: values.enableAutoAssignment,
    maxAssignmentLimit: values.maxAssignmentLimit,
  });
};
</script>

<template>
  <div>
    <SettingsSection
      :title="$t('INBOX_MGMT.SETTINGS_POPUP.INBOX_AGENTS')"
      :sub-title="$t('INBOX_MGMT.SETTINGS_POPUP.INBOX_AGENTS_SUB_TEXT')"
    >
      <multiselect
        v-model="selectedAgents"
        :options="agentList"
        track-by="id"
        label="name"
        multiple
        :close-on-select="false"
        :clear-on-select="false"
        hide-selected
        placeholder="Pick some"
        selected-label
        :select-label="$t('FORMS.MULTISELECT.ENTER_TO_SELECT')"
        :deselect-label="$t('FORMS.MULTISELECT.ENTER_TO_REMOVE')"
      />

      <Button :disabled="isAgentListUpdating" @click="updateAgents">
        <Spinner v-if="isAgentListUpdating" class="size-4 flex-shrink-0" />
        <template v-if="!isAgentListUpdating">{{
          $t('INBOX_MGMT.SETTINGS_POPUP.UPDATE')
        }}</template>
      </Button>
    </SettingsSection>

    <SettingsSection
      :title="$t('INBOX_MGMT.SETTINGS_POPUP.AGENT_ASSIGNMENT')"
      :sub-title="$t('INBOX_MGMT.SETTINGS_POPUP.AGENT_ASSIGNMENT_SUB_TEXT')"
    >
      <Form
        ref="autoAssignForm"
        v-slot="{ values, meta }"
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        @submit="onSubmitAutoAssignment"
      >
        <FormField v-slot="{ value, handleChange }" name="enableAutoAssignment">
          <div class="w-3/4 settings-item">
            <div class="flex items-center gap-2">
              <Checkbox
                id="enableAutoAssignment"
                :checked="value"
                @update:checked="
                  checked =>
                    onToggleAutoAssignment(checked, handleChange, values)
                "
              />
              <Label for="enableAutoAssignment" class="mb-0 font-normal">
                {{ $t('INBOX_MGMT.SETTINGS_POPUP.AUTO_ASSIGNMENT') }}
              </Label>
            </div>
            <p class="pb-1 text-sm not-italic text-n-slate-11">
              {{ $t('INBOX_MGMT.SETTINGS_POPUP.AUTO_ASSIGNMENT_SUB_TEXT') }}
            </p>
          </div>
        </FormField>

        <div v-if="values.enableAutoAssignment && isEnterprise" class="py-3">
          <FormField v-slot="{ componentField }" name="maxAssignmentLimit">
            <FormItem class="flex flex-col gap-1">
              <FormLabel>
                {{ $t('INBOX_MGMT.AUTO_ASSIGNMENT.MAX_ASSIGNMENT_LIMIT') }}
              </FormLabel>
              <FormControl>
                <Input v-bind="componentField" type="number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <p class="pb-1 text-sm not-italic text-n-slate-11">
            {{ $t('INBOX_MGMT.AUTO_ASSIGNMENT.MAX_ASSIGNMENT_LIMIT_SUB_TEXT') }}
          </p>

          <Button type="submit" :disabled="!meta.valid">
            {{ $t('INBOX_MGMT.SETTINGS_POPUP.UPDATE') }}
          </Button>
        </div>
      </Form>
    </SettingsSection>
  </div>
</template>
