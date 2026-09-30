<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const store = useStore();
const { t } = useI18n();
const { visit } = useAppNavigation();

const uiFlags = useMapGetter('inboxes/getUIFlags');

const validationSchema = toTypedSchema(
  z.object({
    inboxName: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.SMS.BANDWIDTH.INBOX_NAME.ERROR')),
    phoneNumber: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.SMS.BANDWIDTH.PHONE_NUMBER.ERROR'))
      .refine(
        value => value.startsWith('+'),
        t('INBOX_MGMT.ADD.SMS.BANDWIDTH.PHONE_NUMBER.ERROR')
      ),
    accountId: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.SMS.BANDWIDTH.ACCOUNT_ID.ERROR')),
    applicationId: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.SMS.BANDWIDTH.APPLICATION_ID.ERROR')),
    apiKey: z.string().min(1, t('INBOX_MGMT.ADD.SMS.BANDWIDTH.API_KEY.ERROR')),
    apiSecret: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.SMS.BANDWIDTH.API_SECRET.ERROR')),
  })
);

const initialValues = {
  inboxName: '',
  phoneNumber: '',
  accountId: '',
  applicationId: '',
  apiKey: '',
  apiSecret: '',
};

const createChannel = async values => {
  try {
    const smsChannel = await store.dispatch('inboxes/createChannel', {
      name: values.inboxName?.trim(),
      channel: {
        type: 'sms',
        phone_number: values.phoneNumber,
        provider_config: {
          api_key: values.apiKey,
          api_secret: values.apiSecret,
          application_id: values.applicationId,
          account_id: values.accountId,
        },
      },
    });

    visit({
      name: 'settings_inboxes_add_agents',
      params: {
        page: 'new',
        inbox_id: smsChannel.id,
      },
    });
  } catch (error) {
    useAlert(t('INBOX_MGMT.ADD.SMS.API.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <Form
    :validation-schema="validationSchema"
    :initial-values="initialValues"
    class="flex flex-wrap flex-col gap-4 mx-0"
    @submit="createChannel"
  >
    <FormField v-slot="{ componentField }" name="inboxName">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.INBOX_NAME.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.INBOX_NAME.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="phoneNumber">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.PHONE_NUMBER.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.PHONE_NUMBER.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="accountId">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.ACCOUNT_ID.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.ACCOUNT_ID.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="applicationId">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.APPLICATION_ID.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.APPLICATION_ID.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="apiKey">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.API_KEY.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.API_KEY.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="apiSecret">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.API_SECRET.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.API_SECRET.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div class="w-full mt-4">
      <Button type="submit" variant="default" :disabled="uiFlags.isCreating">
        <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
        <template v-if="!uiFlags.isCreating">{{
          $t('INBOX_MGMT.ADD.SMS.BANDWIDTH.SUBMIT_BUTTON')
        }}</template>
      </Button>
    </div>
  </Form>
</template>
