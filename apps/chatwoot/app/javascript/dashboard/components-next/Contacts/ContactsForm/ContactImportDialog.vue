<script setup>
import { ref, computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const emit = defineEmits(['import']);
const { t } = useI18n();

const uiFlags = useMapGetter('contacts/getUIFlags');
const isImportingContact = computed(() => uiFlags.value.isImporting);

const isOpen = ref(false);
const fileInput = ref(null);

const hasSelectedFile = ref(null);
const selectedFileName = ref('');

const csvUrl = '/downloads/import-contacts-sample.csv';

const handleFileClick = () => fileInput.value?.click();

const processFileName = fileName => {
  const lastDotIndex = fileName.lastIndexOf('.');
  const extension = fileName.slice(lastDotIndex);
  const baseName = fileName.slice(0, lastDotIndex);

  return baseName.length > 20
    ? `${baseName.slice(0, 20)}...${extension}`
    : fileName;
};

const handleFileChange = () => {
  const file = fileInput.value?.files[0];
  hasSelectedFile.value = file;
  selectedFileName.value = file ? processFileName(file.name) : '';
};

const handleRemoveFile = () => {
  hasSelectedFile.value = null;
  if (fileInput.value) {
    fileInput.value.value = null;
  }
  selectedFileName.value = '';
};

const uploadFile = async () => {
  if (!hasSelectedFile.value) return;
  emit('import', hasSelectedFile.value);
};

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
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
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.DESCRIPTION') }}
          <a
            :href="csvUrl"
            target="_blank"
            rel="noopener noreferrer"
            download="import-contacts-sample.csv"
            class="text-n-blue-text"
          >
            {{
              t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.DOWNLOAD_LABEL')
            }}
          </a>
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <label class="text-sm text-n-slate-12 whitespace-nowrap">
            {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.LABEL') }}
          </label>
          <div class="flex items-center justify-between w-full gap-2">
            <span v-if="hasSelectedFile" class="text-sm text-n-slate-12">
              {{ selectedFileName }}
            </span>
            <Button
              v-if="!hasSelectedFile"
              variant="ghost"
              class="!w-fit"
              @click="handleFileClick"
            >
              <Icon icon="i-lucide-upload" class="size-4" />
              {{
                t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.CHOOSE_FILE')
              }}
            </Button>
            <div v-else class="flex items-center gap-1">
              <Button variant="ghost" @click="handleFileClick">
                {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.CHANGE') }}
              </Button>
              <div class="w-px h-3 bg-n-strong" />
              <Button variant="ghost" size="icon" @click="handleRemoveFile">
                <Icon icon="i-lucide-trash" class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="text/csv"
        class="hidden"
        @change="handleFileChange"
      />

      <DialogFooter class="pt-2">
        <DialogClose as-child>
          <Button variant="outline">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          :disabled="isImportingContact || !hasSelectedFile"
          @click="uploadFile"
        >
          <Spinner v-if="isImportingContact" class="size-4 flex-shrink-0" />
          <template v-if="!isImportingContact">
            {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.IMPORT') }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
