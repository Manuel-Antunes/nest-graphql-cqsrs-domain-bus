<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import wootConstants from 'dashboard/constants/globals';
import { getI18nKey } from 'dashboard/routes/dashboard/settings/helper/settingsHelper';
import { Button } from 'dashboard/components-next/ui/button';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
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
  value: {
    type: Object,
    default: () => ({}),
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
  submitLabel: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['submit', 'cancel']);

const { EXAMPLE_WEBHOOK_URL } = wootConstants;

const supportedWebhookEvents = [
  'conversation_created',
  'conversation_status_changed',
  'conversation_updated',
  'message_created',
  'message_updated',
  'webwidget_triggered',
  'contact_created',
  'contact_updated',
  'conversation_typing_on',
  'conversation_typing_off',
];

const { t } = useI18n();

const webhookURLInputPlaceholder = computed(() =>
  t('INTEGRATION_SETTINGS.WEBHOOK.FORM.END_POINT.PLACEHOLDER', {
    webhookExampleURL: EXAMPLE_WEBHOOK_URL,
  })
);
const webhookNameInputPlaceholder = computed(() =>
  t('INTEGRATION_SETTINGS.WEBHOOK.FORM.NAME.PLACEHOLDER')
);

const validationSchema = toTypedSchema(
  z.object({
    url: z
      .string()
      .min(7, t('INTEGRATION_SETTINGS.WEBHOOK.FORM.END_POINT.ERROR'))
      .url(t('INTEGRATION_SETTINGS.WEBHOOK.FORM.END_POINT.ERROR')),
    name: z.string().optional(),
    subscriptions: z.array(z.string()).min(1),
  })
);

const initialValues = {
  url: props.value.url || '',
  name: props.value.name || '',
  subscriptions: props.value.subscriptions || [],
};

const toggleSubscription = (event, checked, current, setFieldValue) => {
  const list = current || [];
  if (checked) {
    if (!list.includes(event)) {
      setFieldValue('subscriptions', [...list, event]);
    }
  } else {
    setFieldValue(
      'subscriptions',
      list.filter(item => item !== event)
    );
  }
};

const onSubmit = formValues => {
  emit('submit', {
    url: formValues.url,
    name: formValues.name,
    subscriptions: formValues.subscriptions,
  });
};
</script>

<template>
  <Form
    v-slot="{ values, setFieldValue, meta }"
    :validation-schema="validationSchema"
    :initial-values="initialValues"
    class="flex flex-col w-full gap-4"
    @submit="onSubmit"
  >
    <FormField v-slot="{ componentField }" name="url">
      <FormItem class="w-full">
        <FormLabel>
          {{ $t('INTEGRATION_SETTINGS.WEBHOOK.FORM.END_POINT.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="webhookURLInputPlaceholder"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="name">
      <FormItem class="w-full">
        <FormLabel>
          {{ $t('INTEGRATION_SETTINGS.WEBHOOK.FORM.NAME.LABEL') }}
        </FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            :placeholder="webhookNameInputPlaceholder"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div class="w-full">
      <Label class="mb-2">
        {{ $t('INTEGRATION_SETTINGS.WEBHOOK.FORM.SUBSCRIPTIONS.LABEL') }}
      </Label>
      <div class="flex flex-col gap-2.5">
        <div
          v-for="event in supportedWebhookEvents"
          :key="event"
          class="flex items-center gap-2"
        >
          <Checkbox
            :id="event"
            :checked="(values.subscriptions || []).includes(event)"
            @update:checked="
              checked =>
                toggleSubscription(
                  event,
                  checked,
                  values.subscriptions,
                  setFieldValue
                )
            "
          />
          <Label :for="event" class="text-sm font-normal">
            {{
              `${$t(
                getI18nKey(
                  'INTEGRATION_SETTINGS.WEBHOOK.FORM.SUBSCRIPTIONS.EVENTS',
                  event
                )
              )} (${event})`
            }}
          </Label>
        </div>
      </div>
    </div>

    <div class="flex flex-row justify-end w-full gap-2 px-0 py-2">
      <Button variant="outline" type="button" @click.prevent="emit('cancel')">
        {{ $t('INTEGRATION_SETTINGS.WEBHOOK.FORM.CANCEL') }}
      </Button>
      <Button
        variant="default"
        type="submit"
        :disabled="!meta.valid || isSubmitting"
      >
        <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
        <template v-if="!isSubmitting">{{ submitLabel }}</template>
      </Button>
    </div>
  </Form>
</template>
