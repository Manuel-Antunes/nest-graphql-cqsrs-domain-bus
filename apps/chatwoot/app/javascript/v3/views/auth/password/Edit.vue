<script setup>
import { onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useAlert } from 'dashboard/composables';
import { DEFAULT_REDIRECT_URL } from 'dashboard/constants/globals';
import { setNewPassword } from '../../../api/auth';
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
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const props = defineProps({
  resetPasswordToken: { type: String, default: '' },
});

const { t } = useI18n();

const validationSchema = toTypedSchema(
  z
    .object({
      password: z.string().min(6, t('SET_NEW_PASSWORD.PASSWORD.ERROR')),
      confirmPassword: z
        .string()
        .min(6, t('SET_NEW_PASSWORD.CONFIRM_PASSWORD.ERROR')),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: t('SET_NEW_PASSWORD.CONFIRM_PASSWORD.ERROR'),
      path: ['confirmPassword'],
    })
);

const initialValues = { password: '', confirmPassword: '' };

const visible = reactive({ password: false, confirmPassword: false });

onMounted(() => {
  // If url opened without token, redirect to login
  if (!props.resetPasswordToken) {
    window.location = DEFAULT_REDIRECT_URL;
  }
});

const onSubmit = async values => {
  try {
    await setNewPassword({
      password: values.password,
      confirmPassword: values.confirmPassword,
      resetPasswordToken: props.resetPasswordToken,
    });
    window.location = DEFAULT_REDIRECT_URL;
  } catch (error) {
    useAlert(error?.message || t('SET_NEW_PASSWORD.API.ERROR_MESSAGE'));
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
        {{ $t('SET_NEW_PASSWORD.TITLE') }}
      </h1>

      <div class="space-y-5">
        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="mt-3">
            <FormLabel>{{ $t('SET_NEW_PASSWORD.PASSWORD.LABEL') }}</FormLabel>
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
        <FormField v-slot="{ componentField }" name="confirmPassword">
          <FormItem class="mt-3">
            <FormLabel>
              {{ $t('SET_NEW_PASSWORD.CONFIRM_PASSWORD.LABEL') }}
            </FormLabel>
            <FormControl>
              <InputGroup>
                <InputGroupInput
                  v-bind="componentField"
                  :type="visible.confirmPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="
                    $t('SET_NEW_PASSWORD.CONFIRM_PASSWORD.PLACEHOLDER')
                  "
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
        <Button
          type="submit"
          data-testid="submit_button"
          :disabled="isSubmitting"
        >
          <Spinner v-if="isSubmitting" class="size-4" />
          {{ $t('SET_NEW_PASSWORD.SUBMIT') }}
        </Button>
      </div>
    </Form>
  </div>
</template>
