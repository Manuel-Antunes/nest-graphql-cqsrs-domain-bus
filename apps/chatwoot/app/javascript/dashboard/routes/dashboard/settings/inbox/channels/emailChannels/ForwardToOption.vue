<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import PageHeader from '../../../SettingsSubPageHeader.vue';
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
      .min(1, t('INBOX_MGMT.ADD.EMAIL_CHANNEL.CHANNEL_NAME.ERROR')),
    email: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.EMAIL_CHANNEL.EMAIL.ERROR'))
      .email(t('INBOX_MGMT.ADD.EMAIL_CHANNEL.EMAIL.ERROR')),
  })
);

const initialValues = { channelName: '', email: '' };

const createChannel = async values => {
  try {
    const emailChannel = await store.dispatch('inboxes/createChannel', {
      name: values.channelName?.trim(),
      channel: {
        type: 'email',
        email: values.email,
      },
    });

    visit({
      name: 'settings_inboxes_add_agents',
      params: {
        page: 'new',
        inbox_id: emailChannel.id,
      },
    });
  } catch (error) {
    useAlert(
      error?.message || t('INBOX_MGMT.ADD.EMAIL_CHANNEL.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <div class="h-full w-full p-6 col-span-6">
    <PageHeader
      :header-title="$t('INBOX_MGMT.ADD.EMAIL_CHANNEL.TITLE')"
      :header-content="$t('INBOX_MGMT.ADD.EMAIL_CHANNEL.DESC')"
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
            {{ $t('INBOX_MGMT.ADD.EMAIL_CHANNEL.CHANNEL_NAME.LABEL') }}
          </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="
                $t('INBOX_MGMT.ADD.EMAIL_CHANNEL.CHANNEL_NAME.PLACEHOLDER')
              "
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="email">
        <FormItem class="flex-shrink-0 flex-grow-0 mb-4">
          <FormLabel>
            {{ $t('INBOX_MGMT.ADD.EMAIL_CHANNEL.EMAIL.LABEL') }}
          </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              :placeholder="
                $t('INBOX_MGMT.ADD.EMAIL_CHANNEL.EMAIL.PLACEHOLDER')
              "
            />
          </FormControl>
          <p class="help-text">
            {{ $t('INBOX_MGMT.ADD.EMAIL_CHANNEL.EMAIL.SUBTITLE') }}
          </p>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="w-full mt-4">
        <Button variant="default" type="submit" :disabled="uiFlags.isCreating">
          <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isCreating">{{
            $t('INBOX_MGMT.ADD.EMAIL_CHANNEL.SUBMIT_BUTTON')
          }}</template>
        </Button>
      </div>
    </Form>
  </div>
</template>
