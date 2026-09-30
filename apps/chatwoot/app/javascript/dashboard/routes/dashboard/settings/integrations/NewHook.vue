<script setup>
import { computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useIntegrationHook } from 'dashboard/composables/useIntegrationHook';
import { useBranding } from 'shared/composables/useBranding';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Textarea } from 'dashboard/components-next/ui/textarea';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  integrationId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['close']);

const store = useStore();
const { t } = useI18n();
const { integration, isHookTypeInbox } = useIntegrationHook(
  props.integrationId
);
const { replaceInstallationName } = useBranding();

const uiFlags = useMapGetter('integrations/getUIFlags');
const dialogFlowEnabledInboxes = useMapGetter(
  'inboxes/dialogFlowEnabledInboxes'
);

const isIntegrationDialogflow = computed(
  () => integration.value.id === 'dialogflow'
);

const submitButtonLabel = computed(() => {
  if (integration.value.id === 'openai' && uiFlags.value.isCreatingHook) {
    return t('INTEGRATION_APPS.ADD.FORM.VALIDATING_OPENAI');
  }

  return t('INTEGRATION_APPS.ADD.FORM.SUBMIT');
});

const connectedDialogflowInboxIds = computed(() => {
  if (!isIntegrationDialogflow.value) return [];
  return integration.value.hooks.map(hook => hook.inbox?.id);
});

const inboxes = computed(() =>
  dialogFlowEnabledInboxes.value
    .filter(inbox => {
      if (!isIntegrationDialogflow.value) return true;
      return !connectedDialogflowInboxIds.value.includes(inbox.id);
    })
    .map(inbox => ({ label: inbox.name, value: inbox.id }))
);

const formItems = computed(() => integration.value.settings_form_schema || []);

const isValidJSON = value => {
  if (!value) return true;
  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return false;
  }
};

const requiredMessage = item =>
  item['validation-messages']?.required ||
  t('INTEGRATION_APPS.ADD.FORM.REQUIRED_ERROR', {
    field: item.validationName || item.label,
  });

const validationSchema = computed(() => {
  const shape = {};

  formItems.value.forEach(item => {
    const rules = item.validation || '';
    const isRequired = rules.includes('required');
    const isJSON = rules.includes('JSON');

    if (item.type === 'checkbox') {
      shape[item.name] = z.boolean();
    } else if (item.type === 'number') {
      let field = z.union([z.string(), z.number()]).nullish();
      if (isRequired) {
        field = field.refine(
          value => value !== '' && value !== null && value !== undefined,
          requiredMessage(item)
        );
      }
      shape[item.name] = field;
    } else {
      let field = z.string();
      if (isRequired) field = field.min(1, requiredMessage(item));
      if (isJSON) {
        field = field.refine(
          isValidJSON,
          item['validation-messages']?.JSON ||
            t('INTEGRATION_APPS.ADD.FORM.INVALID_JSON')
        );
      }
      shape[item.name] = field;
    }
  });

  if (isHookTypeInbox.value) {
    shape.inbox = z
      .union([z.string(), z.number()])
      .nullish()
      .refine(
        value => value !== '' && value !== null && value !== undefined,
        t('INTEGRATION_APPS.ADD.FORM.INBOX.ERROR')
      );
  }

  return toTypedSchema(z.object(shape));
});

const initialValues = computed(() => {
  const values = {};
  formItems.value.forEach(item => {
    if (item.default !== undefined) {
      values[item.name] = item.default;
    } else {
      values[item.name] = item.type === 'checkbox' ? false : '';
    }
  });
  if (isHookTypeInbox.value) values.inbox = '';
  return values;
});

const onClose = () => emit('close');

const buildHookPayload = values => {
  const hookPayload = {
    app_id: integration.value.id,
    settings: {},
  };

  hookPayload.settings = Object.keys(values).reduce((acc, key) => {
    if (key !== 'inbox') {
      acc[key] = values[key];
    }
    return acc;
  }, {});

  formItems.value.forEach(item => {
    if (item.validation?.includes('JSON')) {
      hookPayload.settings[item.name] = JSON.parse(
        hookPayload.settings[item.name]
      );
    }
  });

  if (isHookTypeInbox.value && values.inbox) {
    hookPayload.inbox_id = values.inbox;
  }

  return hookPayload;
};

const submitForm = async values => {
  try {
    await store.dispatch('integrations/createHook', buildHookPayload(values));
    useAlert(t('INTEGRATION_APPS.ADD.API.SUCCESS_MESSAGE'));
    onClose();
  } catch (error) {
    useAlert(
      error?.response?.data?.message ||
        t('INTEGRATION_APPS.ADD.API.ERROR_MESSAGE')
    );
  }
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) emit('close');
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ integration.name }}</DialogTitle>
        <DialogDescription>
          {{ replaceInstallationName(integration.short_description) }}
        </DialogDescription>
      </DialogHeader>
      <Form
        :key="integration.id"
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="w-full grid gap-4"
        @submit="submitForm"
      >
        <template v-for="item in formItems" :key="item.name">
          <!-- Checkbox -->
          <FormField
            v-if="item.type === 'checkbox'"
            v-slot="{ value, handleChange }"
            :name="item.name"
          >
            <FormItem class="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox :checked="value" @update:checked="handleChange" />
              </FormControl>
              <FormLabel class="mb-0 font-normal">{{ item.label }}</FormLabel>
            </FormItem>
          </FormField>

          <!-- Select -->
          <FormField
            v-else-if="item.type === 'select'"
            v-slot="{ componentField }"
            :name="item.name"
          >
            <FormItem class="w-full">
              <FormLabel>{{ item.label }}</FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="item.placeholder" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem
                    v-for="option in item.options"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-if="item.help" class="text-sm text-n-slate-10">
                {{ item.help }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>

          <!-- Textarea -->
          <FormField
            v-else-if="item.type === 'textarea'"
            v-slot="{ componentField }"
            :name="item.name"
          >
            <FormItem class="w-full">
              <FormLabel>{{ item.label }}</FormLabel>
              <FormControl>
                <Textarea
                  v-bind="componentField"
                  :placeholder="item.placeholder"
                />
              </FormControl>
              <p v-if="item.help" class="text-sm text-n-slate-10">
                {{ item.help }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>

          <!-- Text / number -->
          <FormField v-else v-slot="{ componentField }" :name="item.name">
            <FormItem class="w-full">
              <FormLabel>{{ item.label }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :type="item.type === 'number' ? 'number' : 'text'"
                  :placeholder="item.placeholder"
                />
              </FormControl>
              <p v-if="item.help" class="text-sm text-n-slate-10">
                {{ item.help }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>
        </template>

        <FormField
          v-if="isHookTypeInbox"
          v-slot="{ componentField }"
          name="inbox"
        >
          <FormItem class="w-full">
            <FormLabel>
              {{ $t('INTEGRATION_APPS.ADD.FORM.INBOX.PLACEHOLDER') }}
            </FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue
                    :placeholder="$t('INTEGRATION_APPS.ADD.FORM.INBOX.LABEL')"
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem
                  v-for="option in inboxes"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ $t('INTEGRATION_APPS.ADD.FORM.CANCEL') }}
            </Button>
          </DialogClose>
          <Button
            variant="default"
            type="submit"
            :disabled="uiFlags.isCreatingHook"
          >
            <Spinner
              v-if="uiFlags.isCreatingHook"
              class="size-4 flex-shrink-0"
            />
            {{ submitButtonLabel }}
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>
