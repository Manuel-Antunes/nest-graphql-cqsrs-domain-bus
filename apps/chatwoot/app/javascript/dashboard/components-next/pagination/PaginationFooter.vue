<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNumberFormatter } from 'shared/composables/useNumberFormatter';

import { Button } from 'dashboard/components-next/ui/button';
import { Card } from 'dashboard/components-next/ui/card';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  currentPage: {
    type: Number,
    required: true,
  },
  totalItems: {
    type: Number,
    required: true,
  },
  itemsPerPage: {
    type: Number,
    default: 16,
  },
  currentPageInfo: {
    type: String,
    default: '',
  },
});
const emit = defineEmits(['update:currentPage']);
const { t } = useI18n();
const { formatCompactNumber, formatFullNumber } = useNumberFormatter();

const totalPages = computed(() =>
  Math.ceil(props.totalItems / props.itemsPerPage)
);
const startItem = computed(
  () => (props.currentPage - 1) * props.itemsPerPage + 1
);
const endItem = computed(() =>
  Math.min(startItem.value + props.itemsPerPage - 1, props.totalItems)
);
const isFirstPage = computed(() => props.currentPage === 1);
const isLastPage = computed(() => props.currentPage === totalPages.value);
const changePage = newPage => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    emit('update:currentPage', newPage);
  }
};

const currentPageInformation = computed(() => {
  const translationKey = props.currentPageInfo || 'PAGINATION_FOOTER.SHOWING';
  return t(
    translationKey,
    {
      startItem: formatFullNumber(startItem.value),
      endItem: formatFullNumber(endItem.value),
      totalItems: formatCompactNumber(props.totalItems),
    },
    Number(props.totalItems)
  );
});

const pageInfo = computed(() => {
  return t(
    'PAGINATION_FOOTER.CURRENT_PAGE_INFO',
    {
      currentPage: '',
      totalPages: formatCompactNumber(totalPages.value),
    },
    Number(totalPages.value)
  );
});
</script>

<template>
  <Card
    class="flex-row items-center justify-between gap-0 h-12 w-full max-w-[calc(60rem-3px)] mx-auto py-2 ltr:pl-4 rtl:pr-4 ltr:pr-3 rtl:pl-3 before:absolute before:inset-x-0 before:-top-4 before:bg-gradient-to-t before:from-n-background before:from-10% before:dark:from-0% before:to-transparent before:h-4 before:pointer-events-none"
  >
    <div class="flex items-center gap-3">
      <span class="min-w-0 text-body-main line-clamp-1 text-n-slate-11">
        {{ currentPageInformation }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        :disabled="isFirstPage"
        @click="changePage(1)"
      >
        <Icon icon="i-lucide-chevrons-left" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :disabled="isFirstPage"
        @click="changePage(currentPage - 1)"
      >
        <Icon icon="i-lucide-chevron-left" />
      </Button>
      <div class="inline-flex items-center gap-2 text-sm">
        <span
          class="px-3 tabular-nums py-0.5 font-420 bg-n-input-background text-body-main text-n-slate-12 rounded-md"
        >
          {{ formatFullNumber(currentPage) }}
        </span>
        <span class="truncate text-body-main text-n-slate-11">
          {{ pageInfo }}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        :disabled="isLastPage"
        @click="changePage(currentPage + 1)"
      >
        <Icon icon="i-lucide-chevron-right" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :disabled="isLastPage"
        @click="changePage(totalPages)"
      >
        <Icon icon="i-lucide-chevrons-right" />
      </Button>
    </div>
  </Card>
</template>
