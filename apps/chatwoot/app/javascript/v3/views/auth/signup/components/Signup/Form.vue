<script setup>
import { ref, computed } from 'vue';
import DOMPurify from 'dompurify';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useStore } from 'dashboard/composables/store';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import * as CompanyEmailValidator from 'company-email-validator';
import VueHcaptcha from '@hcaptcha/vue3-hcaptcha';

import { useAlert } from 'dashboard/composables';
import { isValidPassword } from 'shared/helpers/Validators';
import { register } from '../../../../../api/auth';

import GoogleOAuthButton from '../../../../../components/GoogleOauth/Button.vue';
import PasswordRequirements from './PasswordRequirements.vue';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'next/ui/form';
import { Input } from 'next/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from 'next/ui/input-group';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const MIN_PASSWORD_LENGTH = 6;

const { t } = useI18n();
const store = useStore();
const router = useRouter();

const globalConfig = computed(() => store.getters['globalConfig/get']);

const validationSchema = toTypedSchema(
  z.object({
    email: z
      .string()
      .min(1, t('REGISTER.EMAIL.ERROR'))
      .email(t('REGISTER.EMAIL.ERROR'))
      .refine(CompanyEmailValidator.isCompanyEmail, t('REGISTER.EMAIL.ERROR')),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, t('REGISTER.PASSWORD.ERROR'))
      .refine(isValidPassword, t('REGISTER.PASSWORD.IS_INVALID_PASSWORD')),
  })
);

const initialValues = { email: '', password: '' };

const hCaptcha = ref(null);
const isPasswordVisible = ref(false);
const isPasswordFocused = ref(false);
const isSignupInProgress = ref(false);
const pendingCredentials = ref(null);

const termsLink = computed(() =>
  t('REGISTER.TERMS_ACCEPT')
    .replace('https://www.chatwoot.com/terms', globalConfig.value.termsURL)
    .replace(
      'https://www.chatwoot.com/privacy-policy',
      globalConfig.value.privacyURL
    )
);

const sanitizedTermsLink = computed(() => DOMPurify.sanitize(termsLink.value));

const allowedLoginMethods = computed(
  () => window.chatwootConfig.allowedLoginMethods || ['email']
);

const showGoogleOAuth = computed(
  () =>
    allowedLoginMethods.value.includes('google_oauth') &&
    Boolean(window.chatwootConfig.googleOAuthClientId)
);

const performRegistration = async credentials => {
  isSignupInProgress.value = true;
  try {
    await register(credentials);
    router.push({
      name: 'auth_verify_email',
      state: { email: credentials.email },
    });
  } catch (error) {
    const errorMessage = error?.message || t('REGISTER.API.ERROR_MESSAGE');
    if (globalConfig.value.hCaptchaSiteKey) {
      hCaptcha.value?.reset();
    }
    useAlert(errorMessage);
  } finally {
    isSignupInProgress.value = false;
    pendingCredentials.value = null;
  }
};

const onSubmit = credentials => {
  if (isSignupInProgress.value) return;
  isSignupInProgress.value = true;
  if (globalConfig.value.hCaptchaSiteKey) {
    pendingCredentials.value = credentials;
    hCaptcha.value?.execute();
  } else {
    performRegistration(credentials);
  }
};

const onRecaptchaVerified = token => {
  performRegistration({
    ...pendingCredentials.value,
    hCaptchaClientResponse: token,
  });
};

const onCaptchaError = () => {
  isSignupInProgress.value = false;
  pendingCredentials.value = null;
  hCaptcha.value?.reset();
};
</script>

<template>
  <div class="flex-1">
    <Form
      v-slot="{ values, meta }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="space-y-3"
      @submit="onSubmit"
    >
      <FormField v-slot="{ componentField }" name="email">
        <FormItem>
          <FormLabel>{{ $t('REGISTER.EMAIL.LABEL') }}</FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="email"
              autocomplete="email"
              :placeholder="$t('REGISTER.EMAIL.PLACEHOLDER')"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <FormField v-slot="{ componentField }" name="password">
        <FormItem class="relative">
          <FormLabel>{{ $t('LOGIN.PASSWORD.LABEL') }}</FormLabel>
          <FormControl>
            <InputGroup>
              <InputGroupInput
                v-bind="componentField"
                :type="isPasswordVisible ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="$t('SET_NEW_PASSWORD.PASSWORD.PLACEHOLDER')"
                @focus="isPasswordFocused = true"
                @blur="isPasswordFocused = false"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  @click="isPasswordVisible = !isPasswordVisible"
                >
                  <span
                    :class="
                      isPasswordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'
                    "
                    class="size-4"
                  />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </FormControl>
          <Transition
            enter-active-class="transition duration-200 ease-out origin-left"
            enter-from-class="opacity-0 scale-90 translate-x-1"
            enter-to-class="opacity-100 scale-100 translate-x-0"
            leave-active-class="transition duration-150 ease-in origin-left"
            leave-from-class="opacity-100 scale-100 translate-x-0"
            leave-to-class="opacity-0 scale-90 translate-x-1"
          >
            <PasswordRequirements
              v-if="isPasswordFocused"
              :password="values.password || ''"
            />
          </Transition>
          <FormMessage />
        </FormItem>
      </FormField>
      <VueHcaptcha
        v-if="globalConfig.hCaptchaSiteKey"
        ref="hCaptcha"
        size="invisible"
        :sitekey="globalConfig.hCaptchaSiteKey"
        @verify="onRecaptchaVerified"
        @error="onCaptchaError"
        @expired="onCaptchaError"
        @challenge-expired="onCaptchaError"
        @closed="onCaptchaError"
      />
      <Button
        type="submit"
        data-testid="submit_button"
        class="w-full font-medium"
        :disabled="isSignupInProgress || !meta.valid"
      >
        <Spinner v-if="isSignupInProgress" class="size-4" />
        {{ $t('REGISTER.SUBMIT') }}
      </Button>
    </Form>
    <GoogleOAuthButton v-if="showGoogleOAuth" class="mt-3">
      {{ $t('REGISTER.OAUTH.GOOGLE_SIGNUP') }}
    </GoogleOAuthButton>
    <p
      class="text-sm mt-5 mb-0 text-n-slate-11 [&>a]:text-n-blue-10 [&>a]:font-medium [&>a]:hover:text-n-blue-11"
      v-html="sanitizedTermsLink"
    />
  </div>
</template>
