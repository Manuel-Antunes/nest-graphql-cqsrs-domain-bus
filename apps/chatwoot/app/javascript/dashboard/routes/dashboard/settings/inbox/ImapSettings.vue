<script setup>
import { ref, onMounted, watch } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import SettingsSection from 'dashboard/components/SettingsSection.vue';
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

const uiFlags = useMapGetter('inboxes/getUIFlags');

const imapForm = ref(null);

const validationSchema = toTypedSchema(
  z
    .object({
      isIMAPEnabled: z.boolean(),
      address: z.string().optional(),
      port: z.union([z.string(), z.number()]).optional(),
      login: z.string().optional(),
      password: z.string().optional(),
      isSSLEnabled: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (!data.isIMAPEnabled) return;
      if (!data.address) {
        ctx.addIssue({
          path: ['address'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.IMAP.ADDRESS.ERROR'),
        });
      }
      if (!data.port || String(data.port).length < 2) {
        ctx.addIssue({
          path: ['port'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.IMAP.PORT.ERROR'),
        });
      }
      if (!data.login) {
        ctx.addIssue({
          path: ['login'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.IMAP.LOGIN.ERROR'),
        });
      }
      if (!data.password) {
        ctx.addIssue({
          path: ['password'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.IMAP.PASSWORD.ERROR'),
        });
      }
    })
);

const initialValues = {
  isIMAPEnabled: false,
  address: '',
  port: '',
  login: '',
  password: '',
  isSSLEnabled: true,
};

const setDefaults = () => {
  const {
    imap_enabled: imapEnabled,
    imap_address: imapAddress,
    imap_port: imapPort,
    imap_login: imapLogin,
    imap_password: imapPassword,
    imap_enable_ssl: imapEnableSsl,
  } = props.inbox;
  imapForm.value?.setValues({
    isIMAPEnabled: imapEnabled || false,
    address: imapAddress || '',
    port: imapPort || '',
    login: imapLogin || '',
    password: imapPassword || '',
    isSSLEnabled: imapEnableSsl ?? true,
  });
};

onMounted(setDefaults);
watch(() => props.inbox, setDefaults);

const updateInbox = async values => {
  try {
    const payload = {
      id: props.inbox.id,
      formData: false,
      channel: {
        imap_enabled: values.isIMAPEnabled,
        imap_address: values.address,
        imap_port: values.port,
        imap_login: values.login,
        imap_password: values.password,
        imap_enable_ssl: values.isSSLEnabled,
      },
    };

    if (!values.isIMAPEnabled) {
      payload.channel.smtp_enabled = false;
    }

    await store.dispatch('inboxes/updateInboxIMAP', payload);
    useAlert(t('INBOX_MGMT.IMAP.EDIT.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(error.message);
  }
};
</script>

<template>
  <div class="mx-8">
    <SettingsSection
      :title="$t('INBOX_MGMT.IMAP.TITLE')"
      :sub-title="$t('INBOX_MGMT.IMAP.SUBTITLE')"
      :note="$t('INBOX_MGMT.IMAP.NOTE_TEXT')"
    >
      <Form
        ref="imapForm"
        v-slot="{ values, meta }"
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        @submit="updateInbox"
      >
        <FormField v-slot="{ value, handleChange }" name="isIMAPEnabled">
          <div class="flex items-center gap-2">
            <Checkbox :checked="value" @update:checked="handleChange" />
            <Label class="mb-0 font-normal">
              {{ $t('INBOX_MGMT.IMAP.TOGGLE_AVAILABILITY') }}
            </Label>
          </div>
        </FormField>
        <p>{{ $t('INBOX_MGMT.IMAP.TOGGLE_HELP') }}</p>

        <div v-if="values.isIMAPEnabled" class="mb-6 flex flex-col gap-4 mt-4">
          <FormField v-slot="{ componentField }" name="address">
            <FormItem class="flex flex-col gap-1 max-w-[75%] w-full">
              <FormLabel>{{ $t('INBOX_MGMT.IMAP.ADDRESS.LABEL') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="$t('INBOX_MGMT.IMAP.ADDRESS.PLACE_HOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="port">
            <FormItem class="flex flex-col gap-1 max-w-[75%] w-full">
              <FormLabel>{{ $t('INBOX_MGMT.IMAP.PORT.LABEL') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="number"
                  :placeholder="$t('INBOX_MGMT.IMAP.PORT.PLACE_HOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="login">
            <FormItem class="flex flex-col gap-1 max-w-[75%] w-full">
              <FormLabel>{{ $t('INBOX_MGMT.IMAP.LOGIN.LABEL') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="$t('INBOX_MGMT.IMAP.LOGIN.PLACE_HOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="password">
            <FormItem class="flex flex-col gap-1 max-w-[75%] w-full">
              <FormLabel>{{ $t('INBOX_MGMT.IMAP.PASSWORD.LABEL') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="password"
                  :placeholder="$t('INBOX_MGMT.IMAP.PASSWORD.PLACE_HOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ value, handleChange }" name="isSSLEnabled">
            <div class="flex items-center gap-2">
              <Checkbox :checked="value" @update:checked="handleChange" />
              <Label class="mb-0 font-normal">
                {{ $t('INBOX_MGMT.IMAP.ENABLE_SSL') }}
              </Label>
            </div>
          </FormField>
        </div>

        <Button type="submit" :disabled="!meta.valid || uiFlags.isUpdatingIMAP">
          <Spinner v-if="uiFlags.isUpdatingIMAP" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isUpdatingIMAP">{{
            $t('INBOX_MGMT.IMAP.UPDATE')
          }}</template>
        </Button>
      </Form>
    </SettingsSection>
  </div>
</template>
