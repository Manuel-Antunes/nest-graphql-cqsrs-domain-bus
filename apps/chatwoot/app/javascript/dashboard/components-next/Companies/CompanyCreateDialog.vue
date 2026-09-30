<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';
import Input from 'dashboard/components-next/input/Input.vue';
import TextArea from 'dashboard/components-next/textarea/TextArea.vue';

defineProps({
  isLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['create']);

const { t } = useI18n();

const isOpen = ref(false);

const form = reactive({ name: '', domain: '', description: '' });

const isFormInvalid = computed(() => !form.name.trim());

const resetForm = () => {
  form.name = '';
  form.domain = '';
  form.description = '';
};

const open = (company = {}) => {
  form.name = company.name || '';
  form.domain = company.domain || '';
  form.description = company.description || '';
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
  resetForm();
};

const handleConfirm = () => {
  if (isFormInvalid.value) return;

  emit('create', {
    name: form.name.trim(),
    domain: form.domain.trim() || null,
    description: form.description.trim() || null,
  });
};

const onSuccess = () => {
  close();
};

defineExpose({ dialogRef: { open, close }, onSuccess, open });
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
    <DialogContent class="max-w-3xl overflow-y-auto max-h-[90vh]">
      <form class="flex flex-col gap-6" @submit.prevent="handleConfirm">
        <DialogHeader>
          <DialogTitle>{{ t('COMPANIES.CREATE.TITLE') }}</DialogTitle>
        </DialogHeader>
        <div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            v-model="form.name"
            :placeholder="t('COMPANIES.DETAIL.PROFILE.FIELDS.NAME')"
            :disabled="isLoading"
            custom-input-class="h-8 !pt-1 !pb-1 [&:not(.error,.focus)]:!outline-transparent"
            autofocus
          />
          <Input
            v-model="form.domain"
            :placeholder="t('COMPANIES.DETAIL.PROFILE.FIELDS.DOMAIN')"
            :disabled="isLoading"
            custom-input-class="h-8 !pt-1 !pb-1 [&:not(.error,.focus)]:!outline-transparent"
          />
        </div>
        <TextArea
          v-model="form.description"
          :placeholder="t('COMPANIES.DETAIL.PROFILE.DESCRIPTION_PLACEHOLDER')"
          :disabled="isLoading"
          :max-length="280"
          class="w-full"
          show-character-count
          auto-height
        />
        <DialogFooter>
          <Button variant="outline" type="reset" @click="close">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
          <Button type="submit" :disabled="isFormInvalid || isLoading">
            <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
            <template v-if="!isLoading">
              {{ t('COMPANIES.CREATE.ACTIONS.SAVE') }}
            </template>
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
