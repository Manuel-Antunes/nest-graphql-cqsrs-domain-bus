<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { onKeyStroke } from '@vueuse/core';
import { vOnClickOutside } from '@vueuse/components';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  articleId: {
    type: Number,
    required: true,
  },
  blocked: {
    type: Function,
    default: () => false,
  },
});

const emit = defineEmits(['resolved', 'failed']);

const { t } = useI18n();
const store = useStore();
const { currentParams } = useAppNavigation();

const isOpen = ref(false);
const requestedStatus = ref(null);
// Which button is in flight, so only that one shows the spinner.
const activeAction = ref(null);

const articleUiFlags = useMapGetter('articles/uiFlags');
const isLoading = computed(
  () => articleUiFlags.value(props.articleId).isUpdating
);

// Open the confirmation for a target status; resolving it also applies that status.
const open = status => {
  requestedStatus.value = status;
  activeAction.value = null;
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

// Don't let a click-outside or Escape dismiss the popover mid-action.
const dismiss = () => {
  if (!isLoading.value) close();
};

const resolve = async draftAction => {
  if (props.blocked()) return;
  activeAction.value = draftAction === 'publishDraft' ? 'apply' : 'discard';
  try {
    await store.dispatch(`articles/${draftAction}`, {
      portalSlug: currentParams.value.portalSlug,
      articleId: props.articleId,
      status: requestedStatus.value,
    });
    emit('resolved', requestedStatus.value);
    close();
  } catch (error) {
    emit('failed', error);
  }
};

const onApply = () => resolve('publishDraft');
const onDiscard = () => resolve('discardDraft');

onKeyStroke('Escape', () => {
  if (isOpen.value) dismiss();
});

defineExpose({ open, close });
</script>

<template>
  <div
    v-show="isOpen"
    v-on-click-outside="dismiss"
    class="absolute z-50 flex flex-col gap-4 p-4 mt-2 outline outline-1 shadow-lg w-96 end-0 top-full rounded-xl bg-n-alpha-3 backdrop-blur-[100px] outline-n-container"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-col gap-1">
        <h3 class="text-base font-medium text-n-slate-12">
          {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.PENDING_CHANGES_POPOVER.TITLE') }}
        </h3>
        <p class="mb-0 text-sm text-n-slate-11">
          {{
            t(
              'HELP_CENTER.EDIT_ARTICLE_PAGE.PENDING_CHANGES_POPOVER.DESCRIPTION'
            )
          }}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        class="shrink-0 -me-1 -mt-1"
        :disabled="isLoading"
        @click="close"
      >
        <Icon icon="i-lucide-x" />
      </Button>
    </div>
    <div class="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="flex-1 text-destructive hover:text-destructive"
        :disabled="isLoading"
        @click="onDiscard"
      >
        <Spinner
          v-if="isLoading && activeAction === 'discard'"
          class="size-4"
        />
        {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.PENDING_CHANGES_POPOVER.DISCARD') }}
      </Button>
      <Button
        type="button"
        size="sm"
        class="flex-1"
        :disabled="isLoading"
        @click="onApply"
      >
        <Spinner v-if="isLoading && activeAction === 'apply'" class="size-4" />
        {{ t('HELP_CENTER.EDIT_ARTICLE_PAGE.PENDING_CHANGES_POPOVER.APPLY') }}
      </Button>
    </div>
  </div>
</template>
