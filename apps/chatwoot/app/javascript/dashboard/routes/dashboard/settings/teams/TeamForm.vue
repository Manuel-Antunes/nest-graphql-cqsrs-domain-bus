<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useI18n } from 'vue-i18n';
import FormInput from 'v3/components/Form/Input.vue';

import { Button } from 'dashboard/components-next/ui/button';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Label } from 'dashboard/components-next/ui/label';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Form, FormField } from 'dashboard/components-next/ui/form';

const props = defineProps({
  onSubmit: {
    type: Function,
    default: () => {},
  },
  submitInProgress: {
    type: Boolean,
    default: false,
  },
  formData: {
    type: Object,
    default: () => ({}),
  },
  submitButtonText: {
    type: String,
    default: '',
  },
});

const { t } = useI18n();

const validationSchema = toTypedSchema(
  z.object({
    title: z.string().min(2, t('TEAMS_SETTINGS.FORM.NAME.ERROR')),
    description: z.string().optional(),
    allowAutoAssign: z.boolean(),
  })
);

const initialValues = {
  title: props.formData?.name || '',
  description: props.formData?.description || '',
  allowAutoAssign: props.formData?.allow_auto_assign ?? true,
};

const handleSubmit = values => {
  props.onSubmit({
    description: values.description,
    name: values.title,
    allow_auto_assign: values.allowAutoAssign,
  });
};
</script>

<template>
  <div class="flex-shrink-0 w-full">
    <Form
      v-slot="{ meta }"
      :validation-schema="validationSchema"
      :initial-values="initialValues"
      class="mx-0 grid gap-4"
      @submit="handleSubmit"
    >
      <FormField v-slot="{ componentField, errorMessage }" name="title">
        <FormInput
          v-bind="componentField"
          name="title"
          spacing="compact"
          :label="$t('TEAMS_SETTINGS.FORM.NAME.LABEL')"
          :placeholder="$t('TEAMS_SETTINGS.FORM.NAME.PLACEHOLDER')"
          :has-error="!!errorMessage"
          :error-message="errorMessage"
        />
      </FormField>

      <FormField v-slot="{ componentField, errorMessage }" name="description">
        <FormInput
          v-bind="componentField"
          name="description"
          spacing="compact"
          :label="$t('TEAMS_SETTINGS.FORM.DESCRIPTION.LABEL')"
          :placeholder="$t('TEAMS_SETTINGS.FORM.DESCRIPTION.PLACEHOLDER')"
          :has-error="!!errorMessage"
          :error-message="errorMessage"
        />
      </FormField>

      <FormField v-slot="{ value, handleChange }" name="allowAutoAssign">
        <div class="w-full flex items-center gap-2">
          <Checkbox :checked="value" @update:checked="handleChange" />
          <Label>
            {{ $t('TEAMS_SETTINGS.FORM.AUTO_ASSIGN.LABEL') }}
          </Label>
        </div>
      </FormField>

      <div class="flex flex-row justify-end gap-2 py-2 px-0 w-full">
        <div class="w-full">
          <Button type="submit" :disabled="!meta.valid || submitInProgress">
            <Spinner v-if="submitInProgress" class="size-4 flex-shrink-0" />
            <template v-if="!submitInProgress">{{ submitButtonText }}</template>
          </Button>
        </div>
      </div>
    </Form>
  </div>
</template>
