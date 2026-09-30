<script setup>
import { ref, computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'dashboard/components-next/ui/form';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: 'create',
  },
  selectedAppData: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['close']);

const store = useStore();
const { t } = useI18n();

const isLoading = ref(false);

const header = computed(() =>
  t(`INTEGRATION_SETTINGS.DASHBOARD_APPS.${props.mode}.HEADER`)
);
const submitButtonLabel = computed(() =>
  t(`INTEGRATION_SETTINGS.DASHBOARD_APPS.${props.mode}.FORM_SUBMIT`)
);

const validationSchema = toTypedSchema(
  z.object({
    title: z
      .string()
      .min(1, t('INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.TITLE_ERROR')),
    url: z
      .string()
      .min(1, t('INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.URL_ERROR'))
      .url(t('INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.URL_ERROR')),
  })
);

const isUpdate = computed(() => props.mode?.toLowerCase() === 'update');

const initialValues = {
  title: isUpdate.value ? props.selectedAppData.title : '',
  url: isUpdate.value ? props.selectedAppData.content?.[0]?.url : '',
};

const closeModal = () => emit('close');

const submit = async values => {
  try {
    const action = props.mode.toLowerCase();
    const payload = {
      title: values.title,
      content: [{ type: 'frame', url: values.url }],
    };

    if (action === 'update') {
      payload.id = props.selectedAppData.id;
    }

    isLoading.value = true;
    await store.dispatch(`dashboardApps/${action}`, payload);
    useAlert(
      t(`INTEGRATION_SETTINGS.DASHBOARD_APPS.${props.mode}.API_SUCCESS`)
    );
    closeModal();
  } catch (err) {
    useAlert(t(`INTEGRATION_SETTINGS.DASHBOARD_APPS.${props.mode}.API_ERROR`));
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Dialog
    :open="show"
    @update:open="
      val => {
        if (!val) closeModal();
      }
    "
  >
    <DialogContent>
      <div class="flex flex-col h-auto overflow-auto">
        <DialogHeader>
          <DialogTitle>{{ header }}</DialogTitle>
        </DialogHeader>
        <Form
          v-slot="{ meta }"
          :validation-schema="validationSchema"
          :initial-values="initialValues"
          class="flex flex-col w-full gap-4 mt-4"
          @submit="submit"
        >
          <FormField v-slot="{ componentField }" name="title">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.TITLE_LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  data-testid="app-title"
                  :placeholder="
                    $t(
                      'INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.TITLE_PLACEHOLDER'
                    )
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="url">
            <FormItem class="w-full">
              <FormLabel>
                {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.URL_LABEL') }}
              </FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  data-testid="app-url"
                  :placeholder="
                    $t(
                      'INTEGRATION_SETTINGS.DASHBOARD_APPS.FORM.URL_PLACEHOLDER'
                    )
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <DialogFooter>
            <DialogClose as-child>
              <Button variant="outline" type="button">
                {{
                  $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.CREATE.FORM_CANCEL')
                }}
              </Button>
            </DialogClose>
            <Button
              variant="default"
              type="submit"
              :disabled="!meta.valid || isLoading"
            >
              <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
              <template v-if="!isLoading">{{ submitButtonLabel }}</template>
            </Button>
          </DialogFooter>
        </Form>
      </div>
    </DialogContent>
  </Dialog>
</template>
