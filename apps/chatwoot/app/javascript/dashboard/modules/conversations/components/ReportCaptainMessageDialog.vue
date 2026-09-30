<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import MessageReportsAPI from 'dashboard/api/captain/messageReports';

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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from 'next/ui/select';
import TextArea from 'dashboard/components-next/textarea/TextArea.vue';

const props = defineProps({
  messageId: { type: [Number, String], required: true },
});

const { t } = useI18n();
const isOpen = ref(false);
const isLoading = ref(false);

const REPORT_REASONS = [
  'incorrect_information',
  'inappropriate_response',
  'incomplete_response',
  'outdated_information',
  'other',
];

const reasonOptions = computed(() =>
  REPORT_REASONS.map(value => ({
    value,
    label: t(`CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.REASONS.${value}`),
  }))
);

const form = reactive({ reportReason: '', description: '' });

const isFormInvalid = computed(() => !form.reportReason);

const resetForm = () => {
  form.reportReason = '';
  form.description = '';
};

const open = () => {
  resetForm();
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const handleConfirm = async () => {
  if (isFormInvalid.value) return;

  isLoading.value = true;
  try {
    await MessageReportsAPI.create({
      message_id: props.messageId,
      report_reason: form.reportReason,
      description: form.description.trim() || null,
    });
    useAlert(t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.SUCCESS'));
    close();
  } catch (error) {
    useAlert(t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.ERROR'));
  } finally {
    isLoading.value = false;
  }
};

defineExpose({ open, close });
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
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-n-slate-12">
            {{ t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.PROBLEM_TYPE') }}
          </label>
          <Select v-model="form.reportReason">
            <SelectTrigger class="w-full">
              <SelectValue
                :placeholder="
                  t(
                    'CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.PROBLEM_TYPE_PLACEHOLDER'
                  )
                "
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in reasonOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-n-slate-12">
            {{
              t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.DESCRIPTION_LABEL')
            }}
          </label>
          <TextArea
            v-model="form.description"
            class="w-full"
            :placeholder="
              t(
                'CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.DESCRIPTION_PLACEHOLDER'
              )
            "
            :max-length="500"
            show-character-count
            auto-height
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline" :disabled="isLoading">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button :disabled="isFormInvalid || isLoading" @click="handleConfirm">
          <Spinner v-if="isLoading" class="size-4" />
          {{ t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.SUBMIT') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
