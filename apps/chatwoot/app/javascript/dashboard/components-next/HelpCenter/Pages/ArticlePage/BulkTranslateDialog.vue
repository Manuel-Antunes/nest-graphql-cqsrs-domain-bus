<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import categoriesAPI from 'dashboard/api/helpCenter/categories.js';

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
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  selectedArticleIds: {
    type: Array,
    default: () => [],
  },
  allowedLocales: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['translateStarted']);

const { t } = useI18n();
const store = useStore();
const { currentParams, resolvePath } = useAppNavigation();

const isOpen = ref(false);
const isSubmitting = ref(false);
const selectedLocale = ref('');
const selectedCategoryId = ref('');
const targetCategories = ref([]);
const isFetchingCategories = ref(false);
const duplicateArticles = ref([]);

const currentLocale = computed(() => currentParams.value.locale);

const localeOptions = computed(() => {
  return props.allowedLocales
    .filter(locale => locale.code !== currentLocale.value)
    .map(locale => ({
      value: locale.code,
      label: `${locale.name} (${locale.code})`,
    }));
});

const categoryOptions = computed(() => {
  return targetCategories.value.map(category => ({
    value: String(category.id),
    label: category.name,
  }));
});

const articleCount = computed(() => props.selectedArticleIds.length);

const dialogTitle = computed(() =>
  t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.TITLE', articleCount.value)
);

const description = computed(() =>
  t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.DESCRIPTION', articleCount.value)
);

const hasDuplicates = computed(() => duplicateArticles.value.length > 0);

const confirmLabel = computed(() => {
  if (hasDuplicates.value) {
    return t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.CONFIRM_OVERWRITE');
  }
  return t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.CONFIRM');
});

const isConfirmDisabled = computed(() => {
  return !selectedLocale.value || isSubmitting.value;
});

const articleEditUrl = articleId => {
  const { portalSlug, categorySlug, tab } = currentParams.value;
  return resolvePath({
    name: 'portals_articles_edit',
    params: {
      portalSlug,
      locale: selectedLocale.value,
      categorySlug,
      tab,
      articleSlug: articleId,
    },
  });
};

const fetchCategoriesForLocale = async locale => {
  if (!locale) {
    targetCategories.value = [];
    return;
  }

  isFetchingCategories.value = true;
  try {
    const { data } = await categoriesAPI.get({
      portalSlug: currentParams.value.portalSlug,
      locale,
    });
    targetCategories.value = data.payload;
  } catch {
    targetCategories.value = [];
  } finally {
    isFetchingCategories.value = false;
  }
};

watch(selectedLocale, newLocale => {
  selectedCategoryId.value = '';
  duplicateArticles.value = [];
  fetchCategoriesForLocale(newLocale);
});

const resetForm = () => {
  selectedLocale.value = '';
  selectedCategoryId.value = '';
  targetCategories.value = [];
  duplicateArticles.value = [];
};

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

watch(isOpen, value => {
  if (!value) resetForm();
});

const submitTranslation = async (force = false) => {
  isSubmitting.value = true;
  try {
    await store.dispatch('articles/bulkTranslate', {
      portalSlug: currentParams.value.portalSlug,
      articleIds: props.selectedArticleIds,
      locale: selectedLocale.value,
      categoryId: selectedCategoryId.value,
      force,
    });

    useAlert(t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.API.SUCCESS_MESSAGE'));
    close();
    emit('translateStarted');
  } catch (error) {
    if (error.response?.status === 409) {
      duplicateArticles.value = error.response.data.duplicate_articles;
      return;
    }
    useAlert(
      error?.message ||
        t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.API.ERROR_MESSAGE')
    );
  } finally {
    isSubmitting.value = false;
  }
};

const onConfirm = () => {
  if (isConfirmDisabled.value) return;
  submitTranslation(hasDuplicates.value);
};

defineExpose({ dialogRef: { open, close } });
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-n-slate-12">
            {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.LOCALE_LABEL') }}
          </span>
          <AsyncSelect
            v-model="selectedLocale"
            :options="localeOptions"
            :placeholder="
              t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.LOCALE_PLACEHOLDER')
            "
            class="[&>div>button:not(.focused)]:!outline-n-slate-5 [&>div>button:not(.focused)]:dark:!outline-n-slate-5"
          />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-n-slate-12">
            {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.CATEGORY_LABEL') }}
            <span class="text-n-slate-10 font-normal">
              {{ t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.OPTIONAL') }}
            </span>
          </span>
          <AsyncSelect
            v-model="selectedCategoryId"
            :options="categoryOptions"
            :disabled="!selectedLocale || isFetchingCategories"
            :placeholder="
              t('HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.CATEGORY_PLACEHOLDER')
            "
            class="[&>div>button:not(.focused)]:!outline-n-slate-5 [&>div>button:not(.focused)]:dark:!outline-n-slate-5"
          />
        </div>
        <div
          v-if="hasDuplicates"
          class="flex gap-3 p-3 rounded-xl bg-n-amber-2 border border-n-amber-5"
        >
          <Icon
            icon="i-lucide-triangle-alert"
            class="size-4 mt-0.5 text-n-amber-11 shrink-0"
          />
          <div class="flex flex-col gap-2 min-w-0">
            <p class="text-sm text-n-amber-12 m-0">
              {{
                t(
                  'HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.DUPLICATE_WARNING',
                  duplicateArticles.length
                )
              }}
            </p>
            <div class="flex flex-col gap-1">
              <a
                v-for="article in duplicateArticles"
                :key="article.id"
                :href="articleEditUrl(article.id)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-sm text-n-amber-12 underline underline-offset-2 hover:text-n-amber-11 truncate"
              >
                {{ article.title }}
                <Icon icon="i-lucide-external-link" class="size-3 shrink-0" />
              </a>
            </div>
            <p class="text-xs text-n-amber-11 m-0">
              {{
                t(
                  'HELP_CENTER.ARTICLES_PAGE.BULK_TRANSLATE.DUPLICATE_CONFIRM_HINT'
                )
              }}
            </p>
          </div>
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
          :disabled="isConfirmDisabled"
          @click="onConfirm"
        >
          <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
          {{ confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
