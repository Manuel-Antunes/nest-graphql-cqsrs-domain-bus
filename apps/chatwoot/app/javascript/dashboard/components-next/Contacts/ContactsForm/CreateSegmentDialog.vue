<script setup>
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import { useVuelidate } from '@vuelidate/core';
import { required } from '@vuelidate/validators';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';
import { Input } from 'dashboard/components-next/ui/input';

const emit = defineEmits(['create']);

const FILTER_TYPE_CONTACT = 1;

const { t } = useI18n();

const uiFlags = useMapGetter('customViews/getUIFlags');
const isCreating = computed(() => uiFlags.value.isCreating);

const isOpen = ref(false);
const close = () => {
  isOpen.value = false;
};

const state = reactive({
  name: '',
});

const validationRules = {
  name: { required },
};

const v$ = useVuelidate(validationRules, state);

const handleDialogConfirm = async () => {
  const isNameValid = await v$.value.$validate();
  if (!isNameValid) return;
  emit('create', {
    name: state.name,
    filter_type: FILTER_TYPE_CONTACT,
  });
  state.name = '';
  v$.value.$reset();
};
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
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.TITLE') }}
        </DialogTitle>
        <DialogDescription />
      </DialogHeader>
      <Input
        v-model="state.name"
        :label="
          t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.LABEL')
        "
        :placeholder="
          t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.PLACEHOLDER')
        "
        :message="
          v$.name.$error
            ? t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.ERROR')
            : ''
        "
        :message-type="v$.name.$error ? 'error' : 'info'"
      />
      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button :disabled="isCreating" @click="handleDialogConfirm">
          <Spinner v-if="isCreating" class="size-4 flex-shrink-0" />
          <template v-if="!isCreating">
            {{
              t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.CONFIRM')
            }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
