<script setup>
import { ref, watch, useSlots } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import WootMessageEditor from 'dashboard/components/widgets/WootWriter/Editor.vue';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
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
  responseContent: {
    type: String,
    default: '',
  },
});

const open = defineModel('open', { type: Boolean, default: false });

const { t } = useI18n();
const store = useStore();
const slots = useSlots();

const isLoading = ref(false);
const cannedForm = ref(null);

const validationSchema = toTypedSchema(
  z.object({
    shortCode: z.string().min(2, t('CANNED_MGMT.ADD.FORM.SHORT_CODE.ERROR')),
    content: z.string().min(1, t('CANNED_MGMT.ADD.FORM.CONTENT.ERROR')),
  })
);

const getInitialValues = () => ({
  shortCode: '',
  content: props.responseContent || '',
});

const initialValues = getInitialValues();

// Reset the form to a clean slate each time the dialog is opened.
watch(open, isOpen => {
  if (isOpen) {
    cannedForm.value?.resetForm({ values: getInitialValues() });
  }
});

const addCannedResponse = async values => {
  isLoading.value = true;
  try {
    await store.dispatch('createCannedResponse', {
      short_code: values.shortCode,
      content: values.content,
    });
    useAlert(t('CANNED_MGMT.ADD.API.SUCCESS_MESSAGE'));
    cannedForm.value?.resetForm({ values: getInitialValues() });
    open.value = false;
  } catch (error) {
    const errorMessage =
      error?.message || t('CANNED_MGMT.ADD.API.ERROR_MESSAGE');
    useAlert(errorMessage);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('CANNED_MGMT.ADD.TITLE') }}</DialogTitle>
        <DialogDescription>{{ t('CANNED_MGMT.ADD.DESC') }}</DialogDescription>
      </DialogHeader>
      <Form
        ref="cannedForm"
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="flex flex-col w-full gap-2"
        @submit="addCannedResponse"
      >
        <FormField v-slot="{ componentField }" name="shortCode">
          <FormItem class="w-full">
            <FormLabel>{{
              t('CANNED_MGMT.ADD.FORM.SHORT_CODE.LABEL')
            }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="text"
                :placeholder="t('CANNED_MGMT.ADD.FORM.SHORT_CODE.PLACEHOLDER')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ value, handleChange, handleBlur }" name="content">
          <FormItem class="w-full">
            <FormLabel>{{ t('CANNED_MGMT.ADD.FORM.CONTENT.LABEL') }}</FormLabel>
            <FormControl>
              <WootMessageEditor
                :model-value="value"
                class="message-editor [&>div]:px-1"
                channel-type="Context::Default"
                enable-variables
                :enable-canned-responses="false"
                :placeholder="t('CANNED_MGMT.ADD.FORM.CONTENT.PLACEHOLDER')"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">
              {{ t('CANNED_MGMT.ADD.CANCEL_BUTTON_TEXT') }}
            </Button>
          </DialogClose>
          <Button type="submit" :disabled="isLoading">
            <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
            <template v-if="!isLoading">
              {{ t('CANNED_MGMT.ADD.FORM.SUBMIT') }}
            </template>
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
::v-deep {
  .ProseMirror-menubar {
    @apply hidden;
  }

  .ProseMirror-woot-style {
    @apply min-h-[12.5rem];

    p {
      @apply text-base;
    }
  }
}
</style>
