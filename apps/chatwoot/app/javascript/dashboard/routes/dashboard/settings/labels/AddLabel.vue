<script setup>
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { getRandomColor } from 'dashboard/helper/labelColor';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import ColorPicker from 'dashboard/components-next/colorpicker/ColorPicker.vue';
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
  prefillTitle: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['close']);

const { t } = useI18n();
const store = useStore();

const uiFlags = useMapGetter('labels/getUIFlags');

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

const initialValues = {
  title: props.prefillTitle.toLowerCase(),
  description: '',
  color: getRandomColor(),
  showOnSidebar: true,
};

const onClose = () => emit('close');

const addLabel = async values => {
  try {
    await store.dispatch('labels/create', {
      color: values.color,
      description: values.description,
      title: values.title.toLowerCase(),
      show_on_sidebar: values.showOnSidebar,
    });
    useAlert(t('LABEL_MGMT.ADD.API.SUCCESS_MESSAGE'));
    onClose();
  } catch (error) {
    const errorMessage = error.message || t('LABEL_MGMT.ADD.API.ERROR_MESSAGE');
    useAlert(errorMessage);
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
        <DialogTitle>{{ $t('LABEL_MGMT.ADD.TITLE') }}</DialogTitle>
        <DialogDescription>{{ $t('LABEL_MGMT.ADD.DESC') }}</DialogDescription>
      </DialogHeader>
      <Form
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="flex flex-col w-full gap-4"
        @submit="addLabel"
      >
        <FormField v-slot="{ componentField }" name="title">
          <FormItem class="w-full label-name--input">
            <FormLabel>{{ $t('LABEL_MGMT.FORM.NAME.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :placeholder="$t('LABEL_MGMT.FORM.NAME.PLACEHOLDER')"
                data-testid="label-title"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="description">
          <FormItem class="w-full">
            <FormLabel>{{ $t('LABEL_MGMT.FORM.DESCRIPTION.LABEL') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :placeholder="$t('LABEL_MGMT.FORM.DESCRIPTION.PLACEHOLDER')"
                data-testid="label-description"
              />
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
          <Button
            variant="default"
            type="submit"
            data-testid="label-submit"
            :disabled="uiFlags.isCreating"
          >
            <Spinner v-if="uiFlags.isCreating" class="size-4 flex-shrink-0" />
            <template v-if="!uiFlags.isCreating">
              {{ $t('LABEL_MGMT.FORM.CREATE') }}
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
