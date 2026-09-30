<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useLoadWithRetry } from 'dashboard/composables/loadWithRetry';
import BaseBubble from './Base.vue';
import { Button } from 'next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'next/icon/Icon.vue';
import { useSnakeCase } from 'dashboard/composables/useTransformKeys';
import { useMessageContext } from '../provider.js';
import { downloadFile } from '@chatwoot/utils';

import GalleryView from 'dashboard/components/widgets/conversation/components/GalleryView.vue';

const { t } = useI18n();

const { filteredCurrentChatAttachments, attachments } = useMessageContext();

const attachment = computed(() => {
  return attachments.value[0];
});

const { isLoaded, hasError, loadWithRetry } = useLoadWithRetry();

const showGallery = ref(false);
const isDownloading = ref(false);

onMounted(() => {
  if (attachment.value?.dataUrl) {
    loadWithRetry(attachment.value.dataUrl);
  }
});

const downloadAttachment = async () => {
  const { fileType, dataUrl, extension } = attachment.value;
  try {
    isDownloading.value = true;
    await downloadFile({ url: dataUrl, type: fileType, extension });
  } catch (error) {
    useAlert(t('GALLERY_VIEW.ERROR_DOWNLOADING'));
  } finally {
    isDownloading.value = false;
  }
};

const handleImageError = () => {
  hasError.value = true;
};
</script>

<template>
  <BaseBubble
    transparent
    class="overflow-hidden"
    data-bubble-name="image"
    @click="showGallery = true"
  >
    <div v-if="hasError" class="flex items-center gap-1 text-center rounded-lg">
      <Icon icon="i-lucide-circle-off" class="text-n-slate-11" />
      <p class="mb-0 text-n-slate-11">
        {{ $t('COMPONENTS.MEDIA.IMAGE_UNAVAILABLE') }}
      </p>
    </div>
    <div v-else-if="isLoaded" class="relative group rounded-lg overflow-hidden">
      <img
        :src="attachment.dataUrl"
        :width="attachment.width"
        :height="attachment.height"
      />
      <div
        class="inset-0 p-2 pointer-events-none absolute bg-gradient-to-tl from-n-slate-12/30 dark:from-n-slate-1/50 via-transparent to-transparent hidden group-hover:flex"
      />
      <div class="absolute right-2 bottom-2 hidden group-hover:flex gap-2">
        <Button variant="outline" size="icon" class="size-6 opacity-60">
          <Icon icon="i-lucide-expand" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="size-6 opacity-60"
          :disabled="isDownloading"
          @click.stop="downloadAttachment"
        >
          <Spinner v-if="isDownloading" class="size-4" />
          <Icon v-else icon="i-lucide-download" />
        </Button>
      </div>
    </div>
  </BaseBubble>
  <GalleryView
    v-if="showGallery"
    v-model:show="showGallery"
    :attachment="useSnakeCase(attachment)"
    :all-attachments="filteredCurrentChatAttachments"
    @error="handleImageError"
    @close="() => (showGallery = false)"
  />
</template>
