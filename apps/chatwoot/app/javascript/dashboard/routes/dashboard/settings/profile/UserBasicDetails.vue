<script setup>
import { ref, watch } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  name: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  displayName: {
    type: String,
    default: '',
  },
  emailEnabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['updateUser']);

const { t } = useI18n();

const userForm = ref(null);

const validationSchema = toTypedSchema(
  z.object({
    userName: z.string().min(1, t('PROFILE_SETTINGS.FORM.NAME.ERROR')),
    userDisplayName: z.string().optional(),
    userEmail: z
      .string()
      .min(1, t('PROFILE_SETTINGS.FORM.EMAIL.ERROR'))
      .email(t('PROFILE_SETTINGS.FORM.EMAIL.ERROR')),
  })
);

const initialValues = {
  userName: props.name,
  userDisplayName: props.displayName,
  userEmail: props.email,
};

watch(
  () => [props.name, props.displayName, props.email],
  () => {
    userForm.value?.setValues({
      userName: props.name,
      userDisplayName: props.displayName,
      userEmail: props.email,
    });
  }
);

const updateUser = values => {
  emit('updateUser', {
    name: values.userName,
    displayName: values.userDisplayName,
    email: values.userEmail,
  });
};

const onInvalidSubmit = () => {
  useAlert(t('PROFILE_SETTINGS.FORM.ERROR'));
};
</script>

<template>
  <Form
    ref="userForm"
    :validation-schema="validationSchema"
    :initial-values="initialValues"
    class="flex flex-col w-full max-w-md gap-4"
    @submit="updateUser"
    @invalid-submit="onInvalidSubmit"
  >
    <FormField v-slot="{ componentField }" name="userName">
      <FormItem class="w-full">
        <FormLabel>{{ $t('PROFILE_SETTINGS.FORM.NAME.LABEL') }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            :placeholder="$t('PROFILE_SETTINGS.FORM.NAME.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="userDisplayName">
      <FormItem class="w-full">
        <FormLabel>
          {{ $t('PROFILE_SETTINGS.FORM.DISPLAY_NAME.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            :placeholder="$t('PROFILE_SETTINGS.FORM.DISPLAY_NAME.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-if="emailEnabled" v-slot="{ componentField }" name="userEmail">
      <FormItem class="w-full">
        <FormLabel>{{ $t('PROFILE_SETTINGS.FORM.EMAIL.LABEL') }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="email"
            :placeholder="$t('PROFILE_SETTINGS.FORM.EMAIL.PLACEHOLDER')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div>
      <Button type="submit">{{ $t('PROFILE_SETTINGS.BTN_TEXT') }}</Button>
    </div>
  </Form>
</template>
