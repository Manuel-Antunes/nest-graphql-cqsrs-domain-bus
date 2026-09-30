<script setup>
import { useI18n } from 'vue-i18n';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useAlert } from 'dashboard/composables';
import { useBranding } from 'shared/composables/useBranding';
import { resetPassword } from '../../../../api/auth';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from 'next/ui/form';
import { Input } from 'next/ui/input';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const { t } = useI18n();
const { replaceInstallationName } = useBranding();

const validationSchema = toTypedSchema(
  z.object({
    email: z
      .string()
      .min(1, t('RESET_PASSWORD.EMAIL.ERROR'))
      .email(t('RESET_PASSWORD.EMAIL.ERROR')),
  })
);

const initialValues = { email: '' };

const onSubmit = async values => {
  try {
    const res = await resetPassword({ email: values.email });
    useAlert(res?.data?.message || t('RESET_PASSWORD.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(
      error?.response?.data?.message || t('RESET_PASSWORD.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <div
    class="flex flex-col justify-center w-full min-h-screen py-12 bg-n-brand/5 dark:bg-n-background sm:px-6 lg:px-8"
  >
    <Form
      v-slot="{ isSubmitting }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="bg-white shadow sm:mx-auto sm:w-full sm:max-w-lg dark:bg-n-solid-2 p-11 sm:shadow-lg sm:rounded-lg"
      @submit="onSubmit"
    >
      <h1
        class="mb-1 text-2xl font-medium tracking-tight text-left text-n-slate-12"
      >
        {{ $t('RESET_PASSWORD.TITLE') }}
      </h1>
      <p
        class="mb-4 text-sm font-normal leading-6 tracking-normal text-n-slate-11"
      >
        {{ replaceInstallationName($t('RESET_PASSWORD.DESCRIPTION')) }}
      </p>
      <div class="space-y-5">
        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <FormControl>
              <Input
                v-bind="componentField"
                type="email"
                autocomplete="email"
                :placeholder="$t('RESET_PASSWORD.EMAIL.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <Button
          type="submit"
          data-testid="submit_button"
          :disabled="isSubmitting"
        >
          <Spinner v-if="isSubmitting" class="size-4" />
          {{ $t('RESET_PASSWORD.SUBMIT') }}
        </Button>
      </div>
      <p class="mt-4 -mb-1 text-sm text-n-slate-11">
        {{ $t('RESET_PASSWORD.GO_BACK_TO_LOGIN') }}
        <router-link to="/auth/login" class="text-link text-n-brand">
          {{ $t('COMMON.CLICK_HERE') }}.
        </router-link>
      </p>
    </Form>
  </div>
</template>
