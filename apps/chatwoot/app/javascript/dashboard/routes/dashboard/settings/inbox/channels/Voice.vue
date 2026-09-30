<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useAlert } from 'dashboard/composables';
import { isPhoneE164 } from 'shared/helpers/Validators';
import { useStore, useMapGetter } from 'dashboard/composables/store';

import PageHeader from '../../SettingsSubPageHeader.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const { t } = useI18n();
const store = useStore();
const { visit } = useAppNavigation();

const uiFlags = useMapGetter('inboxes/getUIFlags');

const validationSchema = toTypedSchema(
  z.object({
    phoneNumber: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.VOICE.PHONE_NUMBER.ERROR'))
      .refine(isPhoneE164, t('INBOX_MGMT.ADD.VOICE.PHONE_NUMBER.ERROR')),
    accountSid: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.VOICE.TWILIO.ACCOUNT_SID.REQUIRED')),
    authToken: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.VOICE.TWILIO.AUTH_TOKEN.REQUIRED')),
    apiKeySid: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SID.REQUIRED')),
    apiKeySecret: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SECRET.REQUIRED')),
  })
);

const initialValues = {
  phoneNumber: '',
  accountSid: '',
  authToken: '',
  apiKeySid: '',
  apiKeySecret: '',
};

const createChannel = async values => {
  try {
    const channel = await store.dispatch('inboxes/createVoiceChannel', {
      name: `Voice (${values.phoneNumber})`,
      voice: {
        phone_number: values.phoneNumber,
        provider: 'twilio',
        provider_config: {
          account_sid: values.accountSid,
          auth_token: values.authToken,
          api_key_sid: values.apiKeySid,
          api_key_secret: values.apiKeySecret,
        },
      },
    });

    visit({
      name: 'settings_inboxes_add_agents',
      params: { page: 'new', inbox_id: channel.id },
    });
  } catch (error) {
    useAlert(
      error.response?.data?.message ||
        t('INBOX_MGMT.ADD.VOICE.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <div class="overflow-auto col-span-6 p-6 w-full h-full">
    <PageHeader
      :header-title="t('INBOX_MGMT.ADD.VOICE.TITLE')"
      :header-content="t('INBOX_MGMT.ADD.VOICE.DESC')"
    />

    <Form
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-col gap-4 flex-wrap mx-0"
      @submit="createChannel"
    >
      <FormField v-slot="{ componentField, errorMessage }" name="phoneNumber">
        <Input
          v-bind="componentField"
          :label="t('INBOX_MGMT.ADD.VOICE.PHONE_NUMBER.LABEL')"
          :placeholder="t('INBOX_MGMT.ADD.VOICE.PHONE_NUMBER.PLACEHOLDER')"
          :message="errorMessage"
          :message-type="errorMessage ? 'error' : 'info'"
        />
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="accountSid">
        <Input
          v-bind="componentField"
          :label="t('INBOX_MGMT.ADD.VOICE.TWILIO.ACCOUNT_SID.LABEL')"
          :placeholder="
            t('INBOX_MGMT.ADD.VOICE.TWILIO.ACCOUNT_SID.PLACEHOLDER')
          "
          :message="errorMessage"
          :message-type="errorMessage ? 'error' : 'info'"
        />
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="authToken">
        <Input
          v-bind="componentField"
          type="password"
          :label="t('INBOX_MGMT.ADD.VOICE.TWILIO.AUTH_TOKEN.LABEL')"
          :placeholder="t('INBOX_MGMT.ADD.VOICE.TWILIO.AUTH_TOKEN.PLACEHOLDER')"
          :message="errorMessage"
          :message-type="errorMessage ? 'error' : 'info'"
        />
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="apiKeySid">
        <Input
          v-bind="componentField"
          :label="t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SID.LABEL')"
          :placeholder="
            t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SID.PLACEHOLDER')
          "
          :message="errorMessage"
          :message-type="errorMessage ? 'error' : 'info'"
        />
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="apiKeySecret">
        <Input
          v-bind="componentField"
          type="password"
          :label="t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SECRET.LABEL')"
          :placeholder="
            t('INBOX_MGMT.ADD.VOICE.TWILIO.API_KEY_SECRET.PLACEHOLDER')
          "
          :message="errorMessage"
          :message-type="errorMessage ? 'error' : 'info'"
        />
      </FormField>

      <div>
        <Button type="submit" :disabled="uiFlags.isCreating">
          <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isCreating">{{
            t('INBOX_MGMT.ADD.VOICE.SUBMIT_BUTTON')
          }}</template>
        </Button>
      </div>
    </Form>
  </div>
</template>
