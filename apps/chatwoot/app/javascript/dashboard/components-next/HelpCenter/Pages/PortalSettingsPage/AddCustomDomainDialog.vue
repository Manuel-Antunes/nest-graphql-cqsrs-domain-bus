<script setup>
import { ref, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVuelidate } from '@vuelidate/core';
import { helpers } from '@vuelidate/validators';
import { isValidDomain } from '@chatwoot/utils';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';
import Input from 'dashboard/components-next/input/Input.vue';

const props = defineProps({
  mode: {
    type: String,
    default: 'add',
  },
  customDomain: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['addCustomDomain']);

const { t } = useI18n();

const isOpen = ref(false);
const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
};

const formState = reactive({
  customDomain: props.customDomain,
});

const rules = {
  customDomain: {
    isValidDomain: helpers.withMessage(
      () =>
        t(
          'HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.CUSTOM_DOMAIN.DIALOG.FORMAT_ERROR'
        ),
      isValidDomain
    ),
  },
};

const v$ = useVuelidate(rules, formState);

watch(
  () => props.customDomain,
  newVal => {
    formState.customDomain = newVal;
  }
);

const handleDialogConfirm = async () => {
  const isFormCorrect = await v$.value.$validate();
  if (!isFormCorrect) return;

  emit('addCustomDomain', formState.customDomain);
};

defineExpose({ dialogRef: { open, close } });
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="
      val => {
        if (!val) close();
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{
            t(
              `HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.CUSTOM_DOMAIN.DIALOG.${props.mode.toUpperCase()}_HEADER`
            )
          }}
        </DialogTitle>
        <DialogDescription />
      </DialogHeader>
      <Input
        v-model="formState.customDomain"
        :label="
          t(
            'HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.CUSTOM_DOMAIN.DIALOG.LABEL'
          )
        "
        :placeholder="
          t(
            'HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.CUSTOM_DOMAIN.DIALOG.PLACEHOLDER'
          )
        "
        :message="
          v$.customDomain.$error ? v$.customDomain.$errors[0].$message : ''
        "
        :message-type="v$.customDomain.$error ? 'error' : 'info'"
        @blur="v$.customDomain.$touch()"
      />
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button variant="default" class="w-full" @click="handleDialogConfirm">
          {{
            t(
              `HELP_CENTER.PORTAL_SETTINGS.CONFIGURATION_FORM.CUSTOM_DOMAIN.DIALOG.${props.mode.toUpperCase()}_CONFIRM_BUTTON_LABEL`
            )
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
