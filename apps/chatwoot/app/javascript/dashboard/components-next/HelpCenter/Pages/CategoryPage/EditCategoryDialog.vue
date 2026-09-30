<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useStoreGetters } from 'dashboard/composables/store';
import { useAlert, useTrack } from 'dashboard/composables';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { PORTALS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
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
import CategoryForm from 'dashboard/components-next/HelpCenter/Pages/CategoryPage/CategoryForm.vue';

const props = defineProps({
  selectedCategory: {
    type: Object,
    default: () => ({}),
  },
  allowedLocales: {
    type: Array,
    default: () => [],
  },
});

const { t } = useI18n();
const store = useStore();
const { currentParams } = useAppNavigation();
const getters = useStoreGetters();

const isOpen = ref(false);
const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
};

const categoryFormRef = ref(null);

const isUpdatingCategory = computed(() => {
  const id = props.selectedCategory?.id;
  if (id) return getters['categories/uiFlags'].value(id)?.isUpdating;

  return false;
});

const isInvalidForm = computed(() => {
  if (!categoryFormRef.value) return false;
  const { isSubmitDisabled } = categoryFormRef.value;
  return isSubmitDisabled;
});

const activeLocale = computed(() => {
  return props.allowedLocales.find(
    locale => locale.code === currentParams.value.locale
  );
});

const activeLocaleName = computed(() => activeLocale.value?.name ?? '');
const activeLocaleCode = computed(() => activeLocale.value?.code ?? '');

const onUpdateCategory = async () => {
  if (!categoryFormRef.value) return;
  const { state } = categoryFormRef.value;
  const { id, name, slug, icon, description } = state;
  const categoryData = { name, icon, slug, description };
  categoryData.id = id;

  try {
    const payload = {
      portalSlug: currentParams.value.portalSlug,
      categoryObj: categoryData,
      categoryId: id,
    };

    await store.dispatch(`categories/update`, payload);

    const successMessage = t(
      `HELP_CENTER.CATEGORY_PAGE.CATEGORY_DIALOG.EDIT.API.SUCCESS_MESSAGE`
    );
    useAlert(successMessage);
    close();

    const trackEvent = PORTALS_EVENTS.EDIT_CATEGORY;
    useTrack(trackEvent, { hasDescription: Boolean(description) });
  } catch (error) {
    const errorMessage =
      error?.message ||
      t(`HELP_CENTER.CATEGORY_PAGE.CATEGORY_DIALOG.EDIT.API.ERROR_MESSAGE`);
    useAlert(errorMessage);
  }
};

// Expose the dialogRef to the parent component
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
          {{ t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_DIALOG.HEADER.EDIT') }}
        </DialogTitle>
        <DialogDescription>
          {{
            t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_DIALOG.HEADER.DESCRIPTION')
          }}
        </DialogDescription>
      </DialogHeader>
      <CategoryForm
        ref="categoryFormRef"
        mode="edit"
        :selected-category="selectedCategory"
        :active-locale-code="activeLocaleCode"
        :portal-name="currentParams.portalSlug"
        :active-locale-name="activeLocaleName"
        :show-action-buttons="false"
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
          :disabled="isUpdatingCategory || isInvalidForm"
          @click="onUpdateCategory"
        >
          <Spinner v-if="isUpdatingCategory" class="size-4 flex-shrink-0" />
          <template v-if="!isUpdatingCategory">
            {{
              t(
                'HELP_CENTER.CATEGORY_PAGE.CATEGORY_DIALOG.CONFIRM_BUTTON_LABEL'
              )
            }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
