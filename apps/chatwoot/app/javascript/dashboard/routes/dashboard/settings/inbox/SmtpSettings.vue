<script setup>
import { ref, onMounted, watch } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import SettingsFieldSection from 'dashboard/components-next/Settings/SettingsFieldSection.vue';
import InputRadioGroup from './components/InputRadioGroup.vue';
import SingleSelectDropdown from './components/SingleSelectDropdown.vue';
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

const smtpForm = ref(null);
const ssl = ref(false);
const starttls = ref(true);
const openSSLVerifyMode = ref('none');
const authMechanism = ref('login');
const encryptionProtocols = ref([
  { id: 'ssl', title: 'SSL/TLS', checked: false },
  { id: 'starttls', title: 'STARTTLS', checked: true },
]);
const openSSLVerifyModes = [
  { key: 1, value: 'none' },
  { key: 2, value: 'peer' },
  { key: 3, value: 'client_once' },
  { key: 4, value: 'fail_if_no_peer_cert' },
];
const authMechanisms = [
  { key: 1, value: 'plain' },
  { key: 2, value: 'login' },
  { key: 3, value: 'cram-md5' },
  { key: 4, value: 'xoauth' },
  { key: 5, value: 'xoauth2' },
  { key: 6, value: 'ntlm' },
  { key: 7, value: 'gssapi' },
];

const requireWhenEnabled = (data, ctx, field, key) => {
  if (!data[field]) {
    ctx.addIssue({
      path: [field],
      code: z.ZodIssueCode.custom,
      message: t(key),
    });
  }
};

const validationSchema = toTypedSchema(
  z
    .object({
      isSMTPEnabled: z.boolean(),
      address: z.string().optional(),
      port: z.union([z.string(), z.number()]).optional(),
      login: z.string().optional(),
      password: z.string().optional(),
      domain: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (!data.isSMTPEnabled) return;
      requireWhenEnabled(data, ctx, 'address', 'INBOX_MGMT.SMTP.ADDRESS.ERROR');
      if (!data.port || String(data.port).length < 2) {
        ctx.addIssue({
          path: ['port'],
          code: z.ZodIssueCode.custom,
          message: t('INBOX_MGMT.SMTP.PORT.ERROR'),
        });
      }
      requireWhenEnabled(data, ctx, 'login', 'INBOX_MGMT.SMTP.LOGIN.ERROR');
      requireWhenEnabled(
        data,
        ctx,
        'password',
        'INBOX_MGMT.SMTP.PASSWORD.ERROR'
      );
      requireWhenEnabled(data, ctx, 'domain', 'INBOX_MGMT.SMTP.DOMAIN.ERROR');
    })
);

const initialValues = {
  isSMTPEnabled: false,
  address: '',
  port: '',
  login: '',
  password: '',
  domain: '',
};

const setDefaults = () => {
  const {
    smtp_enabled: smtpEnabled,
    smtp_address: smtpAddress,
    smtp_port: smtpPort,
    smtp_login: smtpLogin,
    smtp_password: smtpPassword,
    smtp_domain: smtpDomain,
    smtp_enable_starttls_auto: smtpStarttls,
    smtp_enable_ssl_tls: smtpSsl,
    smtp_openssl_verify_mode: smtpOpenSSLVerifyMode,
    smtp_authentication: smtpAuthentication,
  } = props.inbox;

  smtpForm.value?.setValues({
    isSMTPEnabled: smtpEnabled || false,
    address: smtpAddress || '',
    port: smtpPort || '',
    login: smtpLogin || '',
    password: smtpPassword || '',
    domain: smtpDomain || '',
  });

  starttls.value = smtpStarttls;
  ssl.value = smtpSsl;
  openSSLVerifyMode.value = smtpOpenSSLVerifyMode;
  authMechanism.value = smtpAuthentication;
  encryptionProtocols.value = [
    { id: 'ssl', title: 'SSL/TLS', checked: smtpSsl },
    { id: 'starttls', title: 'STARTTLS', checked: smtpStarttls },
  ];
};

onMounted(setDefaults);
watch(() => props.inbox, setDefaults);

const handleEncryptionChange = encryption => {
  if (encryption.id === 'ssl') {
    ssl.value = true;
    starttls.value = false;
  } else {
    ssl.value = false;
    starttls.value = true;
  }
};

const handleSSLModeChange = mode => {
  openSSLVerifyMode.value = mode;
};

const handleAuthMechanismChange = mode => {
  authMechanism.value = mode;
};

const updateInbox = async values => {
  try {
    const payload = {
      id: props.inbox.id,
      channel: {
        smtp_enabled: values.isSMTPEnabled,
        smtp_address: values.address,
        smtp_port: values.port,
        smtp_login: values.login,
        smtp_password: values.password,
        smtp_domain: values.domain,
        smtp_enable_ssl_tls: ssl.value,
        smtp_enable_starttls_auto: starttls.value,
        smtp_openssl_verify_mode: openSSLVerifyMode.value,
        smtp_authentication: authMechanism.value,
      },
    };
    await store.dispatch('inboxes/updateInboxSMTP', payload);
    useAlert(t('INBOX_MGMT.SMTP.EDIT.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(error.message || t('INBOX_MGMT.SMTP.EDIT.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <SettingsFieldSection
    :label="$t('INBOX_MGMT.SMTP.TITLE')"
    :help-text="$t('INBOX_MGMT.SMTP.SUBTITLE')"
    class="[&>div]:!items-start [&>div>label]:mt-1 mb-4"
  >
    <Form
      ref="smtpForm"
      v-slot="{ values, meta }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      @submit="updateInbox"
    >
      <FormField v-slot="{ value, handleChange }" name="isSMTPEnabled">
        <div class="flex items-center gap-2">
          <Checkbox
            id="toggle-enable-smtp"
            :checked="value"
            @update:checked="handleChange"
          />
          <Label for="toggle-enable-smtp" class="mb-0 font-normal">
            {{ $t('INBOX_MGMT.SMTP.TOGGLE_AVAILABILITY') }}
          </Label>
        </div>
      </FormField>
      <p>{{ $t('INBOX_MGMT.SMTP.TOGGLE_HELP') }}</p>

      <div v-if="values.isSMTPEnabled" class="mb-6 flex flex-col gap-4 mt-4">
        <FormField v-slot="{ componentField }" name="address">
          <FormItem class="flex flex-col gap-1 w-full">
            <FormLabel>{{ $t('INBOX_MGMT.SMTP.ADDRESS.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :placeholder="$t('INBOX_MGMT.SMTP.ADDRESS.PLACE_HOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="port">
          <FormItem class="flex flex-col gap-1 w-full">
            <FormLabel>{{ $t('INBOX_MGMT.SMTP.PORT.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="number"
                :placeholder="$t('INBOX_MGMT.SMTP.PORT.PLACE_HOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="login">
          <FormItem class="flex flex-col gap-1 w-full">
            <FormLabel>{{ $t('INBOX_MGMT.SMTP.LOGIN.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :placeholder="$t('INBOX_MGMT.SMTP.LOGIN.PLACE_HOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="flex flex-col gap-1 w-full">
            <FormLabel>{{ $t('INBOX_MGMT.SMTP.PASSWORD.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="password"
                :placeholder="$t('INBOX_MGMT.SMTP.PASSWORD.PLACE_HOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="domain">
          <FormItem class="flex flex-col gap-1 w-full">
            <FormLabel>{{ $t('INBOX_MGMT.SMTP.DOMAIN.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :placeholder="$t('INBOX_MGMT.SMTP.DOMAIN.PLACE_HOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <InputRadioGroup
          :label="$t('INBOX_MGMT.SMTP.ENCRYPTION')"
          :items="encryptionProtocols"
          :action="handleEncryptionChange"
        />
        <SingleSelectDropdown
          class="w-full"
          :label="$t('INBOX_MGMT.SMTP.OPEN_SSL_VERIFY_MODE')"
          :selected="openSSLVerifyMode"
          :options="openSSLVerifyModes"
          :action="handleSSLModeChange"
        />
        <SingleSelectDropdown
          class="w-full"
          :label="$t('INBOX_MGMT.SMTP.AUTH_MECHANISM')"
          :selected="authMechanism"
          :options="authMechanisms"
          :action="handleAuthMechanismChange"
        />
      </div>

      <Button type="submit" :disabled="!meta.valid || uiFlags.isUpdatingSMTP">
        <Spinner v-if="uiFlags.isUpdatingSMTP" class="size-4 flex-shrink-0" />
        <template v-if="!uiFlags.isUpdatingSMTP">
          {{ $t('INBOX_MGMT.SMTP.UPDATE') }}
        </template>
      </Button>
    </Form>
  </SettingsFieldSection>
</template>
