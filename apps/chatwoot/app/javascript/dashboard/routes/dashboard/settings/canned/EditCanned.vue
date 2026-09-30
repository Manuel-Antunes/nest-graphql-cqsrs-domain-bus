<script setup>
import { ref, computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import WootMessageEditor from 'dashboard/components/widgets/WootWriter/Editor.vue';
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
  open: { type: Boolean, default: false },
  id: { type: Number, default: null },
  edcontent: { type: String, default: '' },
  edshortCode: { type: String, default: '' },
  onClose: { type: Function, default: () => {} },
});

defineEmits(['close']);

const { t } = useI18n();
const store = useStore();

const isLoading = ref(false);

const pageTitle = computed(
  () => `${t('CANNED_MGMT.EDIT.TITLE')} - ${props.edshortCode}`
);

const validationSchema = toTypedSchema(
  z.object({
    shortCode: z.string().min(2, t('CANNED_MGMT.EDIT.FORM.SHORT_CODE.ERROR')),
    content: z.string().min(1, t('CANNED_MGMT.EDIT.FORM.CONTENT.ERROR')),
  })
);

const initialValues = {
  shortCode: props.edshortCode,
  content: props.edcontent,
};

const editCannedResponse = async values => {
  isLoading.value = true;
  try {
    await store.dispatch('updateCannedResponse', {
      id: props.id,
      short_code: values.shortCode,
      content: values.content,
    });
    useAlert(t('CANNED_MGMT.EDIT.API.SUCCESS_MESSAGE'));
    setTimeout(() => {
      props.onClose();
    }, 10);
  } catch (error) {
    const errorMessage =
      error?.message || t('CANNED_MGMT.EDIT.API.ERROR_MESSAGE');
    useAlert(errorMessage);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) $emit('close');
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ pageTitle }}</DialogTitle>
      </DialogHeader>
      <Form
        :validation-schema="validationSchema"
        :initial-values="initialValues"
        class="flex flex-col w-full gap-2"
        @submit="editCannedResponse"
      >
        <FormField v-slot="{ componentField }" name="shortCode">
          <FormItem class="w-full">
            <FormLabel>{{
              $t('CANNED_MGMT.EDIT.FORM.SHORT_CODE.LABEL')
            }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                type="text"
                :placeholder="
                  $t('CANNED_MGMT.EDIT.FORM.SHORT_CODE.PLACEHOLDER')
                "
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ value, handleChange, handleBlur }" name="content">
          <FormItem class="w-full">
            <FormLabel>{{
              $t('CANNED_MGMT.EDIT.FORM.CONTENT.LABEL')
            }}</FormLabel>
            <FormControl>
              <WootMessageEditor
                :model-value="value"
                class="message-editor [&>div]:px-1"
                channel-type="Context::Default"
                enable-variables
                :enable-canned-responses="false"
                :placeholder="$t('CANNED_MGMT.EDIT.FORM.CONTENT.PLACEHOLDER')"
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
              {{ $t('CANNED_MGMT.EDIT.CANCEL_BUTTON_TEXT') }}
            </Button>
          </DialogClose>
          <Button variant="default" type="submit" :disabled="isLoading">
            <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
            <template v-if="!isLoading">{{
              $t('CANNED_MGMT.EDIT.FORM.SUBMIT')
            }}</template>
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
:deep(.ProseMirror-menubar) {
  @apply hidden;
}

:deep(.ProseMirror-woot-style) {
  @apply min-h-[12.5rem];
}
</style>
