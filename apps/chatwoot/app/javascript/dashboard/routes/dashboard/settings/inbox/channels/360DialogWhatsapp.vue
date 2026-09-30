<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { isPhoneE164OrEmpty } from 'shared/helpers/Validators';

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
    inboxName: z.string().min(1, t('INBOX_MGMT.ADD.WHATSAPP.INBOX_NAME.ERROR')),
    phoneNumber: z
      .string()
      .min(1, t('INBOX_MGMT.ADD.WHATSAPP.PHONE_NUMBER.ERROR'))
      .refine(
        isPhoneE164OrEmpty,
        t('INBOX_MGMT.ADD.WHATSAPP.PHONE_NUMBER.ERROR')
      ),
    apiKey: z.string().min(1, t('INBOX_MGMT.ADD.WHATSAPP.API_KEY.ERROR')),
  })
);

const initialValues = { inboxName: '', phoneNumber: '', apiKey: '' };

const createChannel = async values => {
  try {
    const whatsappChannel = await store.dispatch('inboxes/createChannel', {
      name: values.inboxName?.trim(),
      channel: {
        type: 'whatsapp',
        phone_number: values.phoneNumber,
        provider_config: {
          api_key: values.apiKey,
        },
      },
    });

    visit({
      name: 'settings_inboxes_add_agents',
      params: {
        page: 'new',
        inbox_id: whatsappChannel.id,
      },
    });
  } catch (error) {
    useAlert(error.message || t('INBOX_MGMT.ADD.WHATSAPP.API.ERROR_MESSAGE'));
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
          {{ $t('INBOX_MGMT.ADD.WHATSAPP.INBOX_NAME.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="$t('INBOX_MGMT.ADD.WHATSAPP.INBOX_NAME.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="phoneNumber">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.WHATSAPP.PHONE_NUMBER.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.WHATSAPP.PHONE_NUMBER.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="apiKey">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.WHATSAPP.API_KEY.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="$t('INBOX_MGMT.ADD.WHATSAPP.API_KEY.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div class="w-full">
      <Button type="submit" :disabled="uiFlags.isCreating">
        <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
        <template v-if="!uiFlags.isCreating">{{
          $t('INBOX_MGMT.ADD.WHATSAPP.SUBMIT_BUTTON')
        }}</template>
      </Button>
    </div>
  </Form>
</template>
