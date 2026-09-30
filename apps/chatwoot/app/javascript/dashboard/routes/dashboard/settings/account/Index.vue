<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useConfig } from 'dashboard/composables/useConfig';
import { useAccount } from 'dashboard/composables/useAccount';
import { FEATURE_FLAGS } from '../../../../featureFlags';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import AccountId from './components/AccountId.vue';
import BuildInfo from './components/BuildInfo.vue';
import AccountDelete from './components/AccountDelete.vue';
import AudioTranscription from './components/AudioTranscription.vue';
import SectionLayout from './components/SectionLayout.vue';
import { Input } from 'dashboard/components-next/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from 'next/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const { uiSettings } = useUISettings();
const { enabledLanguages } = useConfig();
const { accountId } = useAccount();
const store = useStore();
const { t, locale } = useI18n({ useScope: 'global' });

const getAccount = useMapGetter('accounts/getAccount');
const uiFlags = useMapGetter('accounts/getUIFlags');
const isFeatureEnabledonAccount = useMapGetter(
  'accounts/isFeatureEnabledonAccount'
);
const isOnChatwootCloud = useMapGetter('globalConfig/isOnChatwootCloud');

const accountRecordId = ref('');
const features = ref({});
const accountForm = ref(null);

const validationSchema = toTypedSchema(
  z.object({
    name: z.string().min(1, t('GENERAL_SETTINGS.FORM.NAME.ERROR')),
    locale: z.string().min(1, t('GENERAL_SETTINGS.FORM.LANGUAGE.ERROR')),
    domain: z.string().optional(),
    supportEmail: z.string().optional(),
  })
);

const initialValues = {
  name: '',
  locale: 'en',
  domain: '',
  supportEmail: '',
};

const showAudioTranscriptionConfig = computed(() =>
  isFeatureEnabledonAccount.value(accountId.value, FEATURE_FLAGS.CAPTAIN)
);
const languagesSortedByCode = computed(() =>
  // `enabledLanguages` from useConfig() is a plain array (window.chatwootConfig),
  // not a ref — reading `.value` yields undefined and breaks the language select.
  [...(enabledLanguages ?? [])].sort((l1, l2) =>
    l1.iso_639_1_code.localeCompare(l2.iso_639_1_code)
  )
);
const isUpdating = computed(() => uiFlags.value.isUpdating);
const featureInboundEmailEnabled = computed(
  () => !!features.value?.inbound_emails
);
const featureCustomReplyDomainEnabled = computed(
  () => featureInboundEmailEnabled.value && !!features.value.custom_reply_domain
);
const featureCustomReplyEmailEnabled = computed(
  () => featureInboundEmailEnabled.value && !!features.value.custom_reply_email
);

const currentAccount = computed(() => getAccount.value(accountId.value) || {});

const initializeAccount = () => {
  try {
    const {
      name,
      locale: accountLocale,
      id,
      domain,
      support_email: supportEmail,
      features: accountFeatures,
    } = getAccount.value(accountId.value);

    const effectiveLocale = uiSettings.value?.locale || accountLocale;
    if (effectiveLocale) {
      locale.value = effectiveLocale;
    }
    accountRecordId.value = id;
    features.value = accountFeatures;
    accountForm.value?.setValues({
      name,
      locale: accountLocale,
      domain: domain || '',
      supportEmail: supportEmail || '',
    });
  } catch (error) {
    // Ignore error
  }
};

watch(
  () => currentAccount.value.id,
  id => {
    if (id) {
      initializeAccount();
    }
  },
  { flush: 'post' }
);

onMounted(() => {
  // Account already in the store (navigated in): seed immediately.
  if (currentAccount.value.id) {
    initializeAccount();
  }
});

const updateAccount = async formValues => {
  try {
    await store.dispatch('accounts/update', {
      locale: formValues.locale,
      name: formValues.name,
      domain: formValues.domain,
      support_email: formValues.supportEmail,
    });
    // If user locale is set, update the locale with user locale
    const updatedLocale = uiSettings.value?.locale || formValues.locale;
    if (updatedLocale) {
      locale.value = updatedLocale;
    }
    getAccount.value(accountRecordId.value).locale = formValues.locale;
    useAlert(t('GENERAL_SETTINGS.UPDATE.SUCCESS'));
  } catch (error) {
    useAlert(t('GENERAL_SETTINGS.UPDATE.ERROR'));
  }
};

const onInvalidSubmit = () => {
  useAlert(t('GENERAL_SETTINGS.FORM.ERROR'));
};
</script>

<template>
  <div class="flex flex-col w-full max-w-2xl ltr:mr-auto rtl:ml-auto">
    <BaseSettingsHeader :title="$t('GENERAL_SETTINGS.TITLE')" />
    <div class="flex-grow flex-shrink min-w-0 mt-3">
      <SectionLayout
        :title="$t('GENERAL_SETTINGS.FORM.GENERAL_SECTION.TITLE')"
        :description="$t('GENERAL_SETTINGS.FORM.GENERAL_SECTION.NOTE')"
        class="!pt-0"
      >
        <Form
          v-if="!uiFlags.isFetchingItem"
          ref="accountForm"
          :validation-schema="validationSchema"
          :initial-values="initialValues"
          class="grid gap-4"
          @submit="updateAccount"
          @invalid-submit="onInvalidSubmit"
        >
          <FormField v-slot="{ componentField }" name="name">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('GENERAL_SETTINGS.FORM.NAME.LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="$t('GENERAL_SETTINGS.FORM.NAME.PLACEHOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="locale">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('GENERAL_SETTINGS.FORM.LANGUAGE.LABEL') }}
              </FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem
                    v-for="lang in languagesSortedByCode"
                    :key="lang.iso_639_1_code"
                    :value="lang.iso_639_1_code"
                  >
                    {{ lang.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField
            v-if="featureCustomReplyDomainEnabled"
            v-slot="{ componentField }"
            name="domain"
          >
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('GENERAL_SETTINGS.FORM.DOMAIN.LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  class="w-full"
                  type="text"
                  :placeholder="$t('GENERAL_SETTINGS.FORM.DOMAIN.PLACEHOLDER')"
                />
              </FormControl>
              <p class="text-sm text-muted-foreground">
                {{
                  featureInboundEmailEnabled &&
                  $t('GENERAL_SETTINGS.FORM.FEATURES.INBOUND_EMAIL_ENABLED')
                }}
                {{
                  featureCustomReplyDomainEnabled &&
                  $t(
                    'GENERAL_SETTINGS.FORM.FEATURES.CUSTOM_EMAIL_DOMAIN_ENABLED'
                  )
                }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField
            v-if="featureCustomReplyEmailEnabled"
            v-slot="{ componentField }"
            name="supportEmail"
          >
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('GENERAL_SETTINGS.FORM.SUPPORT_EMAIL.LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  class="w-full"
                  :placeholder="
                    $t('GENERAL_SETTINGS.FORM.SUPPORT_EMAIL.PLACEHOLDER')
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <div>
            <Button :disabled="isUpdating" type="submit">
              <Spinner v-if="isUpdating" class="size-4 flex-shrink-0" />
              <template v-if="!isUpdating">
                {{ $t('GENERAL_SETTINGS.SUBMIT') }}
              </template>
            </Button>
          </div>
        </Form>
      </SectionLayout>

      <woot-loading-state v-if="uiFlags.isFetchingItem" />
    </div>
    <AudioTranscription v-if="showAudioTranscriptionConfig" />
    <AccountId />
    <div v-if="!uiFlags.isFetchingItem && isOnChatwootCloud">
      <AccountDelete />
    </div>
    <BuildInfo />
  </div>
</template>
