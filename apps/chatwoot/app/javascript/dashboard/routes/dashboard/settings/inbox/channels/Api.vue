<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import PageHeader from '../../SettingsSubPageHeader.vue';
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
    channelName: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.API_CHANNEL.CHANNEL_NAME.ERROR')),
    webhookUrl: z
      .string()
      .refine(
        value => !value || value.startsWith('http'),
        t('INBOX_MGMT.ADD.API_CHANNEL.WEBHOOK_URL.ERROR')
      ),
  })
);

const initialValues = { channelName: '', webhookUrl: '' };

const createChannel = async values => {
  try {
    const apiChannel = await store.dispatch('inboxes/createChannel', {
      name: values.channelName?.trim(),
      channel: {
        type: 'api',
        webhook_url: values.webhookUrl,
      },
    });

    visit({
      name: 'settings_inboxes_add_agents',
      params: {
        page: 'new',
        inbox_id: apiChannel.id,
      },
    });
  } catch (error) {
    useAlert(t('INBOX_MGMT.ADD.API_CHANNEL.API.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <div class="h-full w-full p-6 col-span-6">
    <PageHeader
      :header-title="$t('INBOX_MGMT.ADD.API_CHANNEL.TITLE')"
      :header-content="$t('INBOX_MGMT.ADD.API_CHANNEL.DESC')"
    />
    <Form
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="flex flex-wrap flex-col gap-4 mx-0"
      @submit="createChannel"
    >
      <FormField v-slot="{ componentField }" name="channelName">
        <FormItem class="flex-shrink-0 flex-grow-0">
          <FormLabel>
            {{ $t('INBOX_MGMT.ADD.API_CHANNEL.CHANNEL_NAME.LABEL') }}
          </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="
                $t('INBOX_MGMT.ADD.API_CHANNEL.CHANNEL_NAME.PLACEHOLDER')
              "
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="webhookUrl">
        <FormItem class="flex-shrink-0 flex-grow-0">
          <FormLabel>
            {{ $t('INBOX_MGMT.ADD.API_CHANNEL.WEBHOOK_URL.LABEL') }}
          </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="
                $t('INBOX_MGMT.ADD.API_CHANNEL.WEBHOOK_URL.PLACEHOLDER')
              "
            />
          </FormControl>
          <p class="help-text">
            {{ $t('INBOX_MGMT.ADD.API_CHANNEL.WEBHOOK_URL.SUBTITLE') }}
          </p>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="w-full mt-4">
        <Button type="submit" :disabled="uiFlags.isCreating">
          <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isCreating">{{
            $t('INBOX_MGMT.ADD.API_CHANNEL.SUBMIT_BUTTON')
          }}</template>
        </Button>
      </div>
    </Form>
  </div>
</template>
