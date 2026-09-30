<script setup>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';

import { login } from '../../api/auth';
import { useAlert } from 'dashboard/composables';
import { SESSION_STORAGE_KEYS } from 'dashboard/constants/sessionStorage';
import SessionStorage from 'shared/helpers/sessionStorage';
import { useBranding } from 'shared/composables/useBranding';

// components
import SimpleDivider from '../../components/Divider/SimpleDivider.vue';
import GoogleOAuthButton from '../../components/GoogleOauth/Button.vue';
import Spinner from 'shared/components/Spinner.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'next/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'next/ui/form';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from 'next/ui/input-group';
import MfaVerification from 'dashboard/components/auth/MfaVerification.vue';

const props = defineProps({
  ssoAuthToken: { type: String, default: '' },
  ssoAccountId: { type: String, default: '' },
  ssoConversationId: { type: String, default: '' },
  email: { type: String, default: '' },
  authError: { type: String, default: '' },
});

const ERROR_MESSAGES = {
  'no-account-found': 'LOGIN.OAUTH.NO_ACCOUNT_FOUND',
  'business-account-only': 'LOGIN.OAUTH.BUSINESS_ACCOUNTS_ONLY',
  'saml-authentication-failed': 'LOGIN.SAML.API.ERROR_MESSAGE',
  'saml-not-enabled': 'LOGIN.SAML.API.ERROR_MESSAGE',
};

const IMPERSONATION_URL_SEARCH_KEY = 'impersonation';

const store = useStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { replaceInstallationName } = useBranding();

const loginApi = ref({
  message: '',
  showLoading: false,
  hasErrored: false,
});
const mfaRequired = ref(false);
const mfaToken = ref(null);
const showPassword = ref(false);
const loginForm = ref(null);

const validationSchema = toTypedSchema(
  z.object({
    email: z
      .string()
      .min(1, t('LOGIN.EMAIL.ERROR'))
      .email(t('LOGIN.EMAIL.ERROR')),
    password: z.string().min(1, t('LOGIN.PASSWORD.ERROR')),
  })
);

const initialValues = { email: '', password: '' };

const globalConfig = computed(() => store.getters['globalConfig/get']);
const allowedLoginMethods = computed(
  () => window.chatwootConfig.allowedLoginMethods || ['email']
);
const showGoogleOAuth = computed(
  () =>
    allowedLoginMethods.value.includes('google_oauth') &&
    Boolean(window.chatwootConfig.googleOAuthClientId)
);
const showSignupLink = computed(
  () => window.chatwootConfig.signupEnabled === 'true'
);
const showSamlLogin = computed(() =>
  allowedLoginMethods.value.includes('saml')
);

const getTranslatedMessage = key => {
  // Avoid dynamic key warning by handling each case explicitly
  switch (key) {
    case 'LOGIN.OAUTH.NO_ACCOUNT_FOUND':
      return t('LOGIN.OAUTH.NO_ACCOUNT_FOUND');
    case 'LOGIN.OAUTH.BUSINESS_ACCOUNTS_ONLY':
      return t('LOGIN.OAUTH.BUSINESS_ACCOUNTS_ONLY');
    case 'LOGIN.API.UNAUTH':
    default:
      return t('LOGIN.API.UNAUTH');
  }
};

// TODO: Remove this when Safari gets wider support
// Ref: https://caniuse.com/requestidlecallback
const requestIdleCallbackPolyfill = callback => {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(callback);
  } else {
    // Fallback for safari. Using a delay of 0 allows the callback to be
    // executed asynchronously in the next available event loop iteration,
    // similar to requestIdleCallback
    setTimeout(callback, 0);
  }
};

const showAlertMessage = message => {
  loginApi.value.showLoading = false;
  loginApi.value.message = message;
  useAlert(loginApi.value.message);
};

const handleImpersonation = () => {
  // Detects impersonation mode via URL and sets a session flag to prevent
  // user settings changes during impersonation.
  const urlParams = new URLSearchParams(window.location.search);
  const impersonation = urlParams.get(IMPERSONATION_URL_SEARCH_KEY);
  if (impersonation) {
    SessionStorage.set(SESSION_STORAGE_KEYS.IMPERSONATION_USER, true);
  }
};

const submitLogin = (formValues = {}) => {
  loginApi.value.hasErrored = false;
  loginApi.value.showLoading = true;

  const credentials = {
    email: props.email ? decodeURIComponent(props.email) : formValues.email,
    password: formValues.password,
    sso_auth_token: props.ssoAuthToken,
    ssoAccountId: props.ssoAccountId,
    ssoConversationId: props.ssoConversationId,
  };

  login(credentials)
    .then(result => {
      // Check if MFA is required
      if (result?.mfaRequired) {
        loginApi.value.showLoading = false;
        mfaRequired.value = true;
        mfaToken.value = result.mfaToken;
        return;
      }

      handleImpersonation();
      showAlertMessage(t('LOGIN.API.SUCCESS_MESSAGE'));
    })
    .catch(response => {
      // Reset URL Params if the authentication is invalid
      if (props.email) {
        window.location = '/app/login';
      }
      loginApi.value.hasErrored = true;
      showAlertMessage(response?.message || t('LOGIN.API.UNAUTH'));
    });
};

const onSubmit = formValues => {
  submitLogin(formValues);
};

const handleMfaVerified = () => {
  // MFA verification successful, continue with login
  handleImpersonation();
  window.location = '/app';
};

const handleMfaCancel = () => {
  // User cancelled MFA, reset state
  mfaRequired.value = false;
  mfaToken.value = null;
  loginForm.value?.setFieldValue('password', '');
};

onMounted(() => {
  if (props.ssoAuthToken) {
    submitLogin();
  }
  if (props.authError) {
    const messageKey = ERROR_MESSAGES[props.authError] ?? 'LOGIN.API.UNAUTH';
    useAlert(getTranslatedMessage(messageKey));
    // wait for idle state, then remove the error query param from the url
    requestIdleCallbackPolyfill(() => {
      const { query } = route;
      router.replace({ query: { ...query, error: undefined } });
    });
  }
});
</script>

<template>
  <main
    class="flex flex-col w-full min-h-screen py-20 bg-n-brand/5 dark:bg-n-background sm:px-6 lg:px-8"
  >
    <section class="max-w-5xl mx-auto">
      <img
        :src="globalConfig.logo"
        :alt="globalConfig.installationName"
        class="block w-auto h-8 mx-auto dark:hidden"
      />
      <img
        v-if="globalConfig.logoDark"
        :src="globalConfig.logoDark"
        :alt="globalConfig.installationName"
        class="hidden w-auto h-8 mx-auto dark:block"
      />
      <h2 class="mt-6 text-3xl font-medium text-center text-n-slate-12">
        {{ replaceInstallationName($t('LOGIN.TITLE')) }}
      </h2>
      <p v-if="showSignupLink" class="mt-3 text-sm text-center text-n-slate-11">
        {{ $t('COMMON.OR') }}
        <router-link to="auth/signup" class="lowercase text-link text-n-brand">
          {{ $t('LOGIN.CREATE_NEW_ACCOUNT') }}
        </router-link>
      </p>
    </section>

    <!-- MFA Verification Section -->
    <section v-if="mfaRequired" class="mt-11">
      <MfaVerification
        :mfa-token="mfaToken"
        @verified="handleMfaVerified"
        @cancel="handleMfaCancel"
      />
    </section>

    <!-- Regular Login Section -->
    <section
      v-else
      class="bg-white shadow sm:mx-auto mt-11 sm:w-full sm:max-w-lg dark:bg-n-solid-2 p-11 sm:shadow-lg sm:rounded-lg"
      :class="{
        'mb-8 mt-15': !showGoogleOAuth,
        'animate-wiggle': loginApi.hasErrored,
      }"
    >
      <div v-if="!email">
        <div class="flex flex-col gap-4">
          <GoogleOAuthButton v-if="showGoogleOAuth" />
          <div v-if="showSamlLogin" class="text-center">
            <router-link
              to="/app/login/sso"
              class="inline-flex justify-center w-full px-4 py-3 items-center bg-n-background dark:bg-n-solid-3 rounded-md shadow-sm ring-1 ring-inset ring-n-container dark:ring-n-container focus:outline-offset-0 hover:bg-n-alpha-2 dark:hover:bg-n-alpha-2"
            >
              <Icon
                icon="i-lucide-lock-keyhole"
                class="size-5 text-n-slate-11"
              />
              <span class="ml-2 text-base font-medium text-n-slate-12">
                {{ $t('LOGIN.SAML.LABEL') }}
              </span>
            </router-link>
          </div>
          <SimpleDivider
            v-if="showGoogleOAuth || showSamlLogin"
            :label="$t('COMMON.OR')"
            class="uppercase"
          />
        </div>
        <Form
          ref="loginForm"
          :validation-schema="validationSchema"
          :initial-values="initialValues"
          class="space-y-5"
          @submit="onSubmit"
        >
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>{{ $t('LOGIN.EMAIL.LABEL') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="email"
                  autocomplete="email"
                  :placeholder="$t('LOGIN.EMAIL.PLACEHOLDER')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="password">
            <FormItem>
              <div class="flex items-center justify-between gap-2">
                <FormLabel>{{ $t('LOGIN.PASSWORD.LABEL') }}</FormLabel>
                <router-link
                  v-if="!globalConfig.disableUserProfileUpdate"
                  to="auth/reset/password"
                  class="text-sm text-link"
                >
                  {{ $t('LOGIN.FORGOT_PASSWORD') }}
                </router-link>
              </div>
              <FormControl>
                <InputGroup>
                  <InputGroupInput
                    v-bind="componentField"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="current-password"
                    :placeholder="$t('LOGIN.PASSWORD.PLACEHOLDER')"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      :aria-label="
                        showPassword ? 'Hide password' : 'Show password'
                      "
                      @click="showPassword = !showPassword"
                    >
                      <span
                        :class="
                          showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'
                        "
                        class="size-4"
                      />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <Button
            type="submit"
            data-testid="submit_button"
            :disabled="loginApi.showLoading"
          >
            <Spinner v-if="loginApi.showLoading" size="small" />
            {{ $t('LOGIN.SUBMIT') }}
          </Button>
        </Form>
      </div>
      <div v-else class="flex items-center justify-center">
        <Spinner color-scheme="primary" size="" />
      </div>
    </section>
  </main>
</template>
