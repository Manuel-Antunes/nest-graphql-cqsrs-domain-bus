<!-- Deprecated in favour of separate files for SMS and Whatsapp and also to implement new providers for each platform in the future-->
<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { Button } from 'dashboard/components-next/ui/button';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Input } from 'dashboard/components-next/ui/input';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { isPhoneE164OrEmpty } from 'shared/helpers/Validators';
import { parseAPIErrorResponse } from 'dashboard/store/utils/api';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
});

const store = useStore();
const { t } = useI18n();
const { visit } = useAppNavigation();

const uiFlags = useMapGetter('inboxes/getUIFlags');

const validationSchema = toTypedSchema(
  z
    .object({
      channelName: z
        .string()
        .min(1, t('INBOX_MGMT.ADD.TWILIO.CHANNEL_NAME.ERROR')),
      accountSID: z
        .string()
        .min(1, t('INBOX_MGMT.ADD.TWILIO.ACCOUNT_SID.ERROR')),
      authToken: z.string().min(1, t('INBOX_MGMT.ADD.TWILIO.AUTH_TOKEN.ERROR')),
      messagingServiceSID: z.string().optional(),
      phoneNumber: z.string().optional(),
      apiKeySID: z.string().optional(),
      useMessagingService: z.boolean(),
      useAPIKey: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (data.useMessagingService) {
        if (!data.messagingServiceSID) {
          ctx.addIssue({
            path: ['messagingServiceSID'],
            code: z.ZodIssueCode.custom,
            message: t('INBOX_MGMT.ADD.TWILIO.MESSAGING_SERVICE_SID.ERROR'),
          });
        }
      } else if (!data.phoneNumber || !isPhoneE164OrEmpty(data.phoneNumber)) {
        ctx.addIssue({
          path: ['phoneNumber'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.ADD.TWILIO.PHONE_NUMBER.ERROR'),
        });
      }
      if (data.useAPIKey && !data.apiKeySID) {
        ctx.addIssue({
          path: ['apiKeySID'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.ADD.TWILIO.API_KEY.ERROR'),
        });
      }
    })
);

const initialValues = {
  channelName: '',
  accountSID: '',
  authToken: '',
  messagingServiceSID: '',
  phoneNumber: '',
  apiKeySID: '',
  useMessagingService: false,
  useAPIKey: false,
};

const authTokenKey = useAPIKey => (useAPIKey ? 'API_KEY_SECRET' : 'AUTH_TOKEN');

const createChannel = async values => {
  try {
    const twilioChannel = await store.dispatch('inboxes/createTwilioChannel', {
      twilio_channel: {
        name: values.channelName?.trim(),
        medium: props.type,
        account_sid: values.accountSID,
        api_key_sid: values.apiKeySID,
        auth_token: values.authToken,
        messaging_service_sid: values.messagingServiceSID,
        phone_number: values.messagingServiceSID
          ? null
          : `+${values.phoneNumber.replace(/\D/g, '')}`,
      },
    });

    visit({
      name: 'settings_inboxes_add_agents',
      params: {
        page: 'new',
        inbox_id: twilioChannel.id,
      },
    });
  } catch (error) {
    useAlert(
      parseAPIErrorResponse(error) ||
        t('INBOX_MGMT.ADD.TWILIO.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <Form
    v-slot="{ values }"
    :validation-schema="validationSchema"
    :initial-values="initialValues"
    class="flex flex-wrap flex-col gap-4 mx-0"
    @submit="createChannel"
  >
    <FormField v-slot="{ componentField }" name="channelName">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.TWILIO.CHANNEL_NAME.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="$t('INBOX_MGMT.ADD.TWILIO.CHANNEL_NAME.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField
      v-if="values.useMessagingService"
      v-slot="{ componentField }"
      name="messagingServiceSID"
    >
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.TWILIO.MESSAGING_SERVICE_SID.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t('INBOX_MGMT.ADD.TWILIO.MESSAGING_SERVICE_SID.PLACEHOLDER')
            "
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField
      v-if="!values.useMessagingService"
      v-slot="{ componentField }"
      name="phoneNumber"
    >
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.TWILIO.PHONE_NUMBER.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="$t('INBOX_MGMT.ADD.TWILIO.PHONE_NUMBER.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="useMessagingService">
      <FormItem
        class="max-w-[65%] w-full flex flex-row items-center gap-2 space-y-0"
      >
        <FormControl>
          <Checkbox :checked="value" @update:checked="handleChange" />
        </FormControl>
        <FormLabel class="mb-0">
          {{
            $t(
              'INBOX_MGMT.ADD.TWILIO.MESSAGING_SERVICE_SID.USE_MESSAGING_SERVICE'
            )
          }}
        </FormLabel>
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="accountSID">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{ $t('INBOX_MGMT.ADD.TWILIO.ACCOUNT_SID.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="$t('INBOX_MGMT.ADD.TWILIO.ACCOUNT_SID.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="useAPIKey">
      <FormItem
        class="max-w-[65%] w-full flex flex-row items-center gap-2 space-y-0"
      >
        <FormControl>
          <Checkbox :checked="value" @update:checked="handleChange" />
        </FormControl>
        <FormLabel class="mb-0">
          {{ $t('INBOX_MGMT.ADD.TWILIO.API_KEY.USE_API_KEY') }}
        </FormLabel>
      </FormItem>
    </FormField>

    <FormField
      v-if="values.useAPIKey"
      v-slot="{ componentField }"
      name="apiKeySID"
    >
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>{{ $t('INBOX_MGMT.ADD.TWILIO.API_KEY.LABEL') }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="$t('INBOX_MGMT.ADD.TWILIO.API_KEY.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="authToken">
      <FormItem class="flex-shrink-0 flex-grow-0">
        <FormLabel>
          {{
            $t(`INBOX_MGMT.ADD.TWILIO.${authTokenKey(values.useAPIKey)}.LABEL`)
          }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="
              $t(
                `INBOX_MGMT.ADD.TWILIO.${authTokenKey(values.useAPIKey)}.PLACEHOLDER`
              )
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
          $t('INBOX_MGMT.ADD.TWILIO.SUBMIT_BUTTON')
        }}</template>
      </Button>
    </div>
  </Form>
</template>
