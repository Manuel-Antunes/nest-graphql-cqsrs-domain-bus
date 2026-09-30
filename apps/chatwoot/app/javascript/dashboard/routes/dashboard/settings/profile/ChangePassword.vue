<script setup>
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useAlert } from 'dashboard/composables';
import { parseAPIErrorResponse } from 'dashboard/store/utils/api';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from 'dashboard/components-next/ui/form';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from 'dashboard/components-next/ui/input-group';
import { Button } from 'dashboard/components-next/ui/button';

const { t } = useI18n();
const store = useStore();

const validationSchema = toTypedSchema(
  z
    .object({
      currentPassword: z
        .string()
        .min(1, t('PROFILE_SETTINGS.FORM.CURRENT_PASSWORD.ERROR')),
      password: z.string().min(6, t('PROFILE_SETTINGS.FORM.PASSWORD.ERROR')),
      passwordConfirmation: z
        .string()
        .min(6, t('PROFILE_SETTINGS.FORM.PASSWORD_CONFIRMATION.ERROR')),
    })
    .refine(data => data.password === data.passwordConfirmation, {
      message: t('PROFILE_SETTINGS.FORM.PASSWORD_CONFIRMATION.ERROR'),
      path: ['passwordConfirmation'],
    })
);

const initialValues = {
  currentPassword: '',
  password: '',
  passwordConfirmation: '',
};

const visible = reactive({
  currentPassword: false,
  password: false,
  passwordConfirmation: false,
});

const onSubmit = async values => {
  try {
    await store.dispatch('updatePassword', {
      password: values.password,
      passwordConfirmation: values.passwordConfirmation,
      currentPassword: values.currentPassword,
    });
    useAlert(t('PROFILE_SETTINGS.PASSWORD_UPDATE_SUCCESS'), {
      type: 'success',
    });
  } catch (error) {
    useAlert(
      parseAPIErrorResponse(error) || t('RESET_PASSWORD.API.ERROR_MESSAGE'),
      { type: 'error' }
    );
  }
};
</script>

<template>
  <Form
    v-slot="{ isSubmitting }"
    :validation-schema="validationSchema"
    :initial-values="initialValues"
    class="w-full max-w-md"
    @submit="onSubmit"
  >
    <div class="flex flex-col w-full gap-4">
      <FormField v-slot="{ componentField }" name="currentPassword">
        <FormItem>
          <FormLabel>
            {{ t('PROFILE_SETTINGS.FORM.CURRENT_PASSWORD.LABEL') }}
          </FormLabel>
          <FormControl>
            <InputGroup>
              <InputGroupInput
                v-bind="componentField"
                :type="visible.currentPassword ? 'text' : 'password'"
                autocomplete="current-password"
                :placeholder="
                  t('PROFILE_SETTINGS.FORM.CURRENT_PASSWORD.PLACEHOLDER')
                "
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  @click="visible.currentPassword = !visible.currentPassword"
                >
                  <span
                    :class="
                      visible.currentPassword
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

      <FormField v-slot="{ componentField }" name="password">
        <FormItem>
          <FormLabel>
            {{ t('PROFILE_SETTINGS.FORM.PASSWORD.LABEL') }}
          </FormLabel>
          <FormControl>
            <InputGroup>
              <InputGroupInput
                v-bind="componentField"
                :type="visible.password ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('PROFILE_SETTINGS.FORM.PASSWORD.PLACEHOLDER')"
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

      <FormField v-slot="{ componentField }" name="passwordConfirmation">
        <FormItem>
          <FormLabel>
            {{ t('PROFILE_SETTINGS.FORM.PASSWORD_CONFIRMATION.LABEL') }}
          </FormLabel>
          <FormControl>
            <InputGroup>
              <InputGroupInput
                v-bind="componentField"
                :type="visible.passwordConfirmation ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="
                  t('PROFILE_SETTINGS.FORM.PASSWORD_CONFIRMATION.PLACEHOLDER')
                "
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  @click="
                    visible.passwordConfirmation = !visible.passwordConfirmation
                  "
                >
                  <span
                    :class="
                      visible.passwordConfirmation
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

      <div>
        <Button type="submit" :disabled="isSubmitting">
          {{ t('PROFILE_SETTINGS.FORM.PASSWORD_SECTION.BTN_TEXT') }}
        </Button>
      </div>
    </div>
  </Form>
</template>
