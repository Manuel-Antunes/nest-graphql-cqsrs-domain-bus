<script setup>
import { computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
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
import ColorPicker from 'dashboard/components-next/colorpicker/ColorPicker.vue';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  selectedResponse: {
    type: Object,
    default: () => { },
  },
});

const emit = defineEmits(['close']);

const { t } = useI18n();
const store = useStore();

const uiFlags = useMapGetter('labels/getUIFlags');

const pageTitle = computed(
  () => `${t('LABEL_MGMT.EDIT.TITLE')} - ${props.selectedResponse.title}`
);

const validationSchema = toTypedSchema(
  z.object({
    title: z
      .string()
      .min(1, t('LABEL_MGMT.FORM.NAME.REQUIRED_ERROR'))
      .min(2, t('LABEL_MGMT.FORM.NAME.MINIMUM_LENGTH_ERROR'))
      .refine(val => !val.includes(' '), t('LABEL_MGMT.FORM.NAME.VALID_ERROR')),
    description: z.string().optional(),
    color: z.string(),
    showOnSidebar: z.boolean(),
  })
);

// Reactive so a freshly-keyed <Form> seeds from the *current* selected label.
const initialValues = computed(() => ({
  title: props.selectedResponse.title,
  description: props.selectedResponse.description,
  color: props.selectedResponse.color,
  showOnSidebar: props.selectedResponse.show_on_sidebar,
}));

const onClose = () => emit('close');

const editLabel = async values => {
  try {
    await store.dispatch('labels/update', {
      id: props.selectedResponse.id,
      color: values.color,
      description: values.description,
      title: values.title.toLowerCase(),
      show_on_sidebar: values.showOnSidebar,
    });
    useAlert(t('LABEL_MGMT.EDIT.API.SUCCESS_MESSAGE'));
    setTimeout(() => onClose(), 10);
  } catch (error) {
    useAlert(t('LABEL_MGMT.EDIT.API.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <Dialog :open="open" @update:open="
    val => {
      if (!val) emit('close');
    }
  ">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ pageTitle }}</DialogTitle>
      </DialogHeader>
      <Form :key="selectedResponse?.id" :validation-schema="validationSchema" :initial-values="initialValues"
        class="flex flex-col w-full gap-4" @submit="editLabel">
        <FormField v-slot="{ componentField }" name="title">
          <FormItem class="w-full label-name--input">
            <FormLabel>{{ $t('LABEL_MGMT.FORM.NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input v-bind="componentField" :placeholder="$t('LABEL_MGMT.FORM.NAME.PLACEHOLDER')" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="description">
          <FormItem class="w-full">
            <FormLabel>{{ $t('LABEL_MGMT.FORM.DESCRIPTION.LABEL') }}</FormLabel>
            <FormControl>
              <Input v-bind="componentField" :placeholder="$t('LABEL_MGMT.FORM.DESCRIPTION.PLACEHOLDER')" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="color">
          <FormItem class="w-full">
            <FormLabel>{{ $t('LABEL_MGMT.FORM.COLOR.LABEL') }}</FormLabel>
            <FormControl>
              <ColorPicker v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ value, handleChange }" name="showOnSidebar">
          <FormItem class="flex flex-row items-center w-full gap-2 space-y-0">
            <FormControl>
              <Checkbox :checked="value" @update:checked="handleChange" />
            </FormControl>
            <FormLabel>
              {{ $t('LABEL_MGMT.FORM.SHOW_ON_SIDEBAR.LABEL') }}
            </FormLabel>
          </FormItem>
        </FormField>

        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ $t('LABEL_MGMT.FORM.CANCEL') }}
            </Button>
          </DialogClose>
          <Button variant="default" type="submit" :disabled="uiFlags.isUpdating">
            <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
            <template v-if="!uiFlags.isUpdating">
              {{ $t('LABEL_MGMT.FORM.EDIT') }}
            </template>
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>

<style lang="scss" scoped>
// Label API supports only lowercase letters
.label-name--input {
  :deep(input) {
    @apply lowercase;
  }
}
</style>
