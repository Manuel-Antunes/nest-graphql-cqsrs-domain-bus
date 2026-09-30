<script setup>
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import * as CompanyEmailValidator from 'company-email-validator';
import VueHcaptcha from '@hcaptcha/vue3-hcaptcha';

import { useAlert } from 'dashboard/composables';
import { DEFAULT_REDIRECT_URL } from 'dashboard/constants/globals';
import { isValidPassword } from 'shared/helpers/Validators';
import { register } from '../../../../../api/auth';

import SimpleDivider from '../../../../../components/Divider/SimpleDivider.vue';
import GoogleOAuthButton from '../../../../../components/GoogleOauth/Button.vue';
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
import Icon from 'dashboard/components-next/icon/Icon.vue';

const MIN_PASSWORD_LENGTH = 6;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{}|'"/\\.,`<>:;?~]/;

const { t } = useI18n();
const store = useStore();

const globalConfig = computed(() => store.getters['globalConfig/get']);

const validationSchema = toTypedSchema(
  z
    .object({
      fullName: z.string().min(2, t('REGISTER.FULL_NAME.ERROR')),
      accountName: z.string().min(2, t('REGISTER.COMPANY_NAME.ERROR')),
      email: z
        .string()
        .min(1, t('REGISTER.EMAIL.ERROR'))
        .email(t('REGISTER.EMAIL.ERROR'))
        .refine(
          CompanyEmailValidator.isCompanyEmail,
          t('REGISTER.EMAIL.ERROR')
        ),
      password: z
        .string()
        .min(MIN_PASSWORD_LENGTH, t('REGISTER.PASSWORD.ERROR'))
        .refine(isValidPassword, t('REGISTER.PASSWORD.IS_INVALID_PASSWORD')),
      confirmPassword: z
        .string()
        .min(MIN_PASSWORD_LENGTH, t('REGISTER.PASSWORD.ERROR')),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: t('REGISTER.CONFIRM_PASSWORD.ERROR'),
      path: ['confirmPassword'],
    })
);

const initialValues = {
  fullName: '',
  accountName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const visible = reactive({ password: false, confirmPassword: false });

// hCaptcha is managed outside the schema since it is a third-party widget.
const hCaptcha = ref(null);
const hCaptchaToken = ref('');
const didCaptchaReset = ref(false);

const termsLink = computed(() =>
  t('REGISTER.TERMS_ACCEPT')
    .replace('https://www.chatwoot.com/terms', globalConfig.value.termsURL)
    .replace(
      'https://www.chatwoot.com/privacy-policy',
      globalConfig.value.privacyURL
    )
);

const hasAValidCaptcha = computed(() => {
  if (globalConfig.value.hCaptchaSiteKey) {
    return !!hCaptchaToken.value;
  }
  return true;
});

const allowedLoginMethods = computed(
  () => window.chatwootConfig.allowedLoginMethods || ['email']
);

const showGoogleOAuth = computed(
  () =>
    allowedLoginMethods.value.includes('google_oauth') &&
    Boolean(window.chatwootConfig.googleOAuthClientId)
);

const getPasswordRequirements = (password = '') => ({
  length: password.length >= MIN_PASSWORD_LENGTH,
  uppercase: /[A-Z]/.test(password),
  lowercase: /[a-z]/.test(password),
  number: /[0-9]/.test(password),
  special: SPECIAL_CHAR_REGEX.test(password),
});

const passwordRequirementItems = password => {
  const reqs = getPasswordRequirements(password);
  return [
    {
      id: 'length',
      met: reqs.length,
      label: t('REGISTER.PASSWORD.REQUIREMENTS_LENGTH', {
        min: MIN_PASSWORD_LENGTH,
      }),
    },
    {
      id: 'uppercase',
      met: reqs.uppercase,
      label: t('REGISTER.PASSWORD.REQUIREMENTS_UPPERCASE'),
    },
    {
      id: 'lowercase',
      met: reqs.lowercase,
      label: t('REGISTER.PASSWORD.REQUIREMENTS_LOWERCASE'),
    },
    {
      id: 'number',
      met: reqs.number,
      label: t('REGISTER.PASSWORD.REQUIREMENTS_NUMBER'),
    },
    {
      id: 'special',
      met: reqs.special,
      label: t('REGISTER.PASSWORD.REQUIREMENTS_SPECIAL'),
    },
  ];
};

const resetCaptcha = () => {
  if (!globalConfig.value.hCaptchaSiteKey) return;
  hCaptcha.value?.reset();
  hCaptchaToken.value = '';
  didCaptchaReset.value = true;
};

const onRecaptchaVerified = token => {
  hCaptchaToken.value = token;
  didCaptchaReset.value = false;
};

const onSubmit = async credentials => {
  if (!hasAValidCaptcha.value) {
    resetCaptcha();
    return;
  }
  try {
    await register({
      ...credentials,
      hCaptchaClientResponse: hCaptchaToken.value,
    });
    window.location = DEFAULT_REDIRECT_URL;
  } catch (error) {
    resetCaptcha();
    useAlert(error?.message || t('REGISTER.API.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <div class="flex-1 px-1 overflow-auto">
    <Form
      v-slot="{ values, isSubmitting }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="space-y-3"
      @submit="onSubmit"
    >
      <div class="grid grid-cols-2 gap-2">
        <FormField v-slot="{ componentField }" name="fullName">
          <FormItem class="flex-1">
            <FormLabel>{{ $t('REGISTER.FULL_NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                autocomplete="name"
                :placeholder="$t('REGISTER.FULL_NAME.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="accountName">
          <FormItem class="flex-1">
            <FormLabel>{{ $t('REGISTER.COMPANY_NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                autocomplete="organization"
                :placeholder="$t('REGISTER.COMPANY_NAME.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </div>
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
        <FormItem>
          <FormLabel>{{ $t('LOGIN.PASSWORD.LABEL') }}</FormLabel>
          <FormControl>
            <InputGroup>
              <InputGroupInput
                v-bind="componentField"
                :type="visible.password ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="$t('SET_NEW_PASSWORD.PASSWORD.PLACEHOLDER')"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  @click="visible.password = !visible.password"
                >
                  <span
                    :class="
                      visible.password ? 'i-lucide-eye-off' : 'i-lucide-eye'
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
      <div
        id="password-requirements"
        class="text-xs rounded-md px-4 py-3 outline outline-1 outline-n-weak bg-n-alpha-black2"
      >
        <ul role="list" class="grid grid-cols-2 gap-1">
          <li
            v-for="item in passwordRequirementItems(values.password || '')"
            :key="item.id"
            class="inline-flex gap-1 items-start"
          >
            <Icon
              class="flex-none flex-shrink-0 w-3 mt-0.5"
              :icon="item.met ? 'i-lucide-circle-check-big' : 'i-lucide-circle'"
              :class="item.met ? 'text-n-teal-10' : 'text-n-slate-10'"
            />

            <span :class="item.met ? 'text-n-slate-11' : 'text-n-slate-10'">
              {{ item.label }}
            </span>
          </li>
        </ul>
      </div>
      <FormField v-slot="{ componentField }" name="confirmPassword">
        <FormItem>
          <FormLabel>{{ $t('REGISTER.CONFIRM_PASSWORD.LABEL') }}</FormLabel>
          <FormControl>
            <InputGroup>
              <InputGroupInput
                v-bind="componentField"
                :type="visible.confirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="$t('REGISTER.CONFIRM_PASSWORD.PLACEHOLDER')"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  @click="visible.confirmPassword = !visible.confirmPassword"
                >
                  <span
                    :class="
                      visible.confirmPassword
                        ? 'i-lucide-eye-off'
                        : 'i-lucide-eye'
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
      <div v-if="globalConfig.hCaptchaSiteKey" class="mb-3">
        <VueHcaptcha
          ref="hCaptcha"
          :class="{ error: !hasAValidCaptcha && didCaptchaReset }"
          :sitekey="globalConfig.hCaptchaSiteKey"
          @verify="onRecaptchaVerified"
        />
        <span
          v-if="!hasAValidCaptcha && didCaptchaReset"
          class="text-xs text-n-ruby-9"
        >
          {{ $t('SET_NEW_PASSWORD.CAPTCHA.ERROR') }}
        </span>
      </div>
      <Button
        type="submit"
        data-testid="submit_button"
        :disabled="isSubmitting || !hasAValidCaptcha"
      >
        <Spinner v-if="isSubmitting" class="size-4" />
        {{ $t('REGISTER.SUBMIT') }}
        <Icon v-if="!isSubmitting" icon="i-lucide-chevron-right" />
      </Button>
    </Form>
    <div class="flex flex-col">
      <SimpleDivider
        v-if="showGoogleOAuth"
        :label="$t('COMMON.OR')"
        bg="bg-n-background"
        class="uppercase"
      />
      <GoogleOAuthButton v-if="showGoogleOAuth">
        {{ $t('REGISTER.OAUTH.GOOGLE_SIGNUP') }}
      </GoogleOAuthButton>
    </div>
    <p
      class="text-sm mb-1 mt-5 text-n-slate-12 [&>a]:text-n-brand [&>a]:font-medium [&>a]:hover:brightness-110"
      v-html="termsLink"
    />
  </div>
</template>

<style scoped lang="scss">
.h-captcha--box {
  &::v-deep .error {
    iframe {
      @apply rounded-md border border-n-ruby-8 dark:border-n-ruby-8;
    }
  }
}
</style>
