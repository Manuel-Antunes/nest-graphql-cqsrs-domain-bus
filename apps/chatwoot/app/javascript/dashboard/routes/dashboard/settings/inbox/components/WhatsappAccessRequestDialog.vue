<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
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
import { Spinner } from 'next/ui/spinner';
import TextArea from 'dashboard/components-next/textarea/TextArea.vue';

const MAX_USE_CASE_LENGTH = 2000;

const { t } = useI18n();
const store = useStore();
const isOpen = ref(false);
const useCase = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

const submit = async () => {
  if (isSubmitting.value || !useCase.value.trim()) return;

  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    await store.dispatch(
      'accounts/requestWhatsappEmbeddedSignupAccess',
      useCase.value.trim()
    );
    isOpen.value = false;
  } catch {
    errorMessage.value = t(
      'INBOX_MGMT.ADD.WHATSAPP.EMBEDDED_SIGNUP.ACCESS_REQUEST.ERROR'
    );
  } finally {
    isSubmitting.value = false;
  }
};

const open = () => {
  errorMessage.value = '';
  isOpen.value = true;
};

defineExpose({ open });
</script>

<template>
  <Dialog :open="isOpen" @update:open="isOpen = $event">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{
            t('INBOX_MGMT.ADD.WHATSAPP.EMBEDDED_SIGNUP.ACCESS_REQUEST.BUTTON')
          }}
        </DialogTitle>
        <DialogDescription>
          {{
            t(
              'INBOX_MGMT.ADD.WHATSAPP.EMBEDDED_SIGNUP.ACCESS_REQUEST.FORM_DESCRIPTION'
            )
          }}
        </DialogDescription>
      </DialogHeader>
      <TextArea
        id="whatsapp-use-case"
        v-model="useCase"
        :label="
          t(
            'INBOX_MGMT.ADD.WHATSAPP.EMBEDDED_SIGNUP.ACCESS_REQUEST.USE_CASE_LABEL'
          )
        "
        :placeholder="
          t(
            'INBOX_MGMT.ADD.WHATSAPP.EMBEDDED_SIGNUP.ACCESS_REQUEST.USE_CASE_PLACEHOLDER'
          )
        "
        :max-length="MAX_USE_CASE_LENGTH"
        :disabled="isSubmitting"
        :message="errorMessage"
        :message-type="errorMessage ? 'error' : 'info'"
        show-character-count
        autofocus
      />
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          class="w-full"
          :disabled="!useCase.trim() || isSubmitting"
          @click="submit"
        >
          <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
          {{
            t('INBOX_MGMT.ADD.WHATSAPP.EMBEDDED_SIGNUP.ACCESS_REQUEST.SUBMIT')
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
