<script setup>
import { ref, computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import filterQueryGenerator from 'dashboard/helper/filterQueryGenerator';

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

const emit = defineEmits(['export']);

const { t } = useI18n();
const { currentParams } = useAppNavigation();

const isOpen = ref(false);

const segments = useMapGetter('customViews/getContactCustomViews');
const appliedFilters = useMapGetter('contacts/getAppliedContactFilters');
const uiFlags = useMapGetter('contacts/getUIFlags');
const isExportingContact = computed(() => uiFlags.value.isExporting);

const activeSegmentId = computed(() => currentParams.value.segmentId);
const activeSegment = computed(() =>
  activeSegmentId.value
    ? segments.value.find(view => view.id === Number(activeSegmentId.value))
    : undefined
);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const exportContacts = async () => {
  let query = { payload: [] };

  if (activeSegmentId.value && activeSegment.value) {
    query = activeSegment.value.query;
  } else if (Object.keys(appliedFilters.value).length > 0) {
    query = filterQueryGenerator(appliedFilters.value);
  }

  emit('export', {
    ...query,
    label: currentParams.value.label || '',
  });
};

const handleDialogConfirm = async () => {
  await exportContacts();
  close();
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
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.EXPORT_CONTACT.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.EXPORT_CONTACT.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          :disabled="isExportingContact"
          @click="handleDialogConfirm"
        >
          <Spinner v-if="isExportingContact" class="size-4 flex-shrink-0" />
          <template v-if="!isExportingContact">
            {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.EXPORT_CONTACT.CONFIRM') }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
