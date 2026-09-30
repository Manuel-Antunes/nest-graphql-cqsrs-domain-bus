<script setup>
import IframeLoader from 'shared/components/IframeLoader.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { useMapGetter } from 'dashboard/composables/store';

defineProps({
  url: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['back', 'insert']);

const isRTL = useMapGetter('accounts/isRTL');

const onBack = e => {
  e.stopPropagation();
  emit('back');
};

const onInsert = e => {
  e.stopPropagation();
  emit('insert');
};
</script>

<template>
  <div class="h-full w-full flex flex-col flex-1 overflow-hidden">
    <div class="py-1">
      <Button variant="link" class="h-6 px-2 text-xs" @click="onBack">
        <Icon icon="i-lucide-chevron-left" class="size-4" />
        {{ $t('HELP_CENTER.ARTICLE_SEARCH.BACK_RESULTS') }}
      </Button>
    </div>
    <div class="-ml-4 h-full overflow-y-auto">
      <div class="w-full h-full min-h-0">
        <IframeLoader :url="url" :is-rtl="isRTL" is-dir-applied />
      </div>
    </div>

    <div class="flex justify-end gap-2 py-2">
      <Button variant="outline" type="reset" @click="onBack">
        <Icon icon="i-lucide-chevron-left" class="size-4" />
        {{ $t('HELP_CENTER.ARTICLE_SEARCH.BACK') }}
      </Button>
      <Button variant="default" type="submit" @click="onInsert">
        <Icon icon="i-lucide-arrow-down-to-dot" class="size-4" />
        {{ $t('HELP_CENTER.ARTICLE_SEARCH.INSERT_ARTICLE') }}
      </Button>
    </div>
  </div>
</template>
