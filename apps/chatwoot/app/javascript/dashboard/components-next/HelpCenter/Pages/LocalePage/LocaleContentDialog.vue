<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
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
import Input from 'dashboard/components-next/input/Input.vue';

const props = defineProps({
  portal: {
    type: Object,
    default: () => ({}),
  },
});

const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);
const isSubmitting = ref(false);
const activeLocale = ref('');
const name = ref('');
const pageTitle = ref('');
const headerText = ref('');

const localeTranslations = computed(
  () => props.portal?.config?.locale_translations || {}
);

const openForLocale = localeCode => {
  const existing = localeTranslations.value[localeCode] || {};
  activeLocale.value = localeCode;
  name.value = existing.name || '';
  pageTitle.value = existing.page_title || '';
  headerText.value = existing.header_text || '';
  isOpen.value = true;
};

const onConfirm = async () => {
  const translations = { ...localeTranslations.value };
  const fields = {};
  if (name.value.trim()) fields.name = name.value.trim();
  if (pageTitle.value.trim()) fields.page_title = pageTitle.value.trim();
  if (headerText.value.trim()) fields.header_text = headerText.value.trim();

  if (Object.keys(fields).length) {
    translations[activeLocale.value] = fields;
  } else {
    delete translations[activeLocale.value];
  }

  isSubmitting.value = true;
  try {
    await store.dispatch('portals/update', {
      portalSlug: props.portal?.slug,
      config: { locale_translations: translations },
    });
    isOpen.value = false;
    useAlert(t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(
      error?.message ||
        t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.API.ERROR_MESSAGE')
    );
  } finally {
    isSubmitting.value = false;
  }
};

defineExpose({ openForLocale });
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-n-slate-12">
            {{ t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.NAME.LABEL') }}
          </label>
          <Input v-model="name" :placeholder="portal.name" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-n-slate-12">
            {{ t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.PAGE_TITLE.LABEL') }}
          </label>
          <Input v-model="pageTitle" :placeholder="portal.page_title" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-n-slate-12">
            {{ t('HELP_CENTER.LOCALES_PAGE.CONTENT_DIALOG.HEADER_TEXT.LABEL') }}
          </label>
          <Input v-model="headerText" :placeholder="portal.header_text" />
        </div>
      </div>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          class="w-full"
          :disabled="isSubmitting"
          @click="onConfirm"
        >
          <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
          {{ t('DIALOG.BUTTONS.CONFIRM') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
