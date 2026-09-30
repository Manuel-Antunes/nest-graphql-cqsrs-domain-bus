<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { BaseTable } from 'dashboard/components-next/table';

defineProps({
  title: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
  isOpen: {
    type: Boolean,
    default: false,
  },
  isDownloading: {
    type: Boolean,
    default: false,
  },
  downloadLabel: {
    type: String,
    default: '',
  },
  headers: {
    type: Array,
    default: () => [],
  },
  items: {
    type: Array,
    default: () => [],
  },
  emptyMessage: {
    type: String,
    default: '',
  },
});

defineEmits(['toggle', 'download']);
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-n-weak bg-n-solid-1">
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 !p-0"
        :aria-expanded="isOpen"
        @click="$emit('toggle')"
      >
        <h2 class="text-heading-3 text-n-slate-12">{{ title }}</h2>
        <span
          v-if="count"
          class="rounded-md bg-n-alpha-2 px-1.5 text-label-small tabular-nums text-n-slate-11"
        >
          {{ count }}
        </span>
        <Icon
          icon="i-lucide-chevron-down"
          class="size-4 shrink-0 text-n-slate-10 transition-transform duration-200"
          :class="{ '-rotate-90 rtl:rotate-90': !isOpen }"
        />
      </button>
      <Button
        variant="ghost"
        size="sm"
        :disabled="!count || isDownloading"
        @click="$emit('download')"
      >
        <Spinner v-if="isDownloading" class="size-4" />
        <Icon v-else icon="i-lucide-download" />
        {{ downloadLabel }}
      </Button>
    </div>
    <div
      class="grid transition-[grid-template-rows] duration-300 ease-in-out"
      :class="isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="border-t border-n-weak">
          <slot name="filters" />
          <p
            v-if="!items.length"
            class="px-4 py-8 text-center text-body-main text-n-slate-11"
          >
            {{ emptyMessage }}
          </p>
          <div v-else class="overflow-x-auto">
            <BaseTable
              class="[&_td:first-child]:ps-4 [&_th:first-child]:ps-4 [&_th]:text-n-slate-11 [&_thead]:border-t-0"
              :headers="headers"
              :items="items"
            >
              <template #row="{ items: rows }">
                <slot name="row" :items="rows" />
              </template>
            </BaseTable>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
