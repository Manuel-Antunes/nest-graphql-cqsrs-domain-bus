<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { useAlert, useTrack } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { PORTALS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import allLocales from 'shared/constants/locales.js';
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from 'next/ui/select';
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';

const props = defineProps({
  portal: {
    type: Object,
    default: () => ({}),
  },
});

const { t } = useI18n();
const store = useStore();
const { currentRouteName } = useAppNavigation();

const isOpen = ref(false);
const isUpdating = ref(false);

const selectedLocale = ref('');
const localeStatus = ref('published');

const close = () => {
  isOpen.value = false;
};

const addedLocales = computed(() => {
  const { allowed_locales: allowedLocales = [] } = props.portal?.config || {};
  return allowedLocales.map(locale => locale.code);
});

const draftedLocales = computed(() => {
  const { allowed_locales: allowedLocales = [] } = props.portal?.config || {};
  return allowedLocales
    .filter(locale => locale.draft)
    .map(locale => locale.code);
});

const locales = computed(() => {
  return Object.keys(allLocales)
    .map(key => {
      return {
        value: key,
        label: `${allLocales[key]} (${key})`,
      };
    })
    .filter(locale => !addedLocales.value.includes(locale.value));
});

const statusOptions = computed(() => [
  {
    value: 'published',
    label: t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.STATUS.OPTIONS.LIVE'),
  },
  {
    value: 'draft',
    label: t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.STATUS.OPTIONS.DRAFT'),
  },
]);

const resetForm = () => {
  selectedLocale.value = '';
  localeStatus.value = 'published';
};

watch(localeStatus, value => {
  if (!value) {
    localeStatus.value = 'published';
  }
});

watch(isOpen, value => {
  if (!value) resetForm();
});

const onCreate = async () => {
  if (!selectedLocale.value) return;

  isUpdating.value = true;
  const updatedLocales = [...addedLocales.value, selectedLocale.value];
  const updatedDraftLocales =
    localeStatus.value === 'draft'
      ? [...new Set([...draftedLocales.value, selectedLocale.value])]
      : draftedLocales.value;

  try {
    await store.dispatch('portals/update', {
      portalSlug: props.portal?.slug,
      config: {
        allowed_locales: updatedLocales,
        draft_locales: updatedDraftLocales,
        default_locale: props.portal?.meta?.default_locale,
      },
    });

    useTrack(PORTALS_EVENTS.CREATE_LOCALE, {
      localeAdded: selectedLocale.value,
      totalLocales: updatedLocales.length,
      from: currentRouteName.value,
    });

    close();
    useAlert(
      t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.API.SUCCESS_MESSAGE')
    );
  } catch (error) {
    useAlert(
      error?.message ||
        t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.API.ERROR_MESSAGE')
    );
  } finally {
    isUpdating.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-6">
        <AsyncSelect
          v-model="selectedLocale"
          :options="locales"
          :placeholder="
            t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.COMBOBOX.PLACEHOLDER')
          "
          class="[&>div>button:not(.focused)]:!outline-n-slate-5 [&>div>button:not(.focused)]:dark:!outline-n-slate-5"
        />
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-n-slate-12">
            {{ t('HELP_CENTER.LOCALES_PAGE.ADD_LOCALE_DIALOG.STATUS.LABEL') }}
          </span>
          <Select v-model="localeStatus">
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in statusOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button>{{ t('DIALOG.BUTTONS.CANCEL') }}</Button>
        </DialogClose>
        <Button :disabled="isUpdating" @click="onCreate">
          <Spinner v-if="isUpdating" class="size-4 flex-shrink-0" />
          <template v-if="!isUpdating">
            {{ t('DIALOG.BUTTONS.CONFIRM') }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
