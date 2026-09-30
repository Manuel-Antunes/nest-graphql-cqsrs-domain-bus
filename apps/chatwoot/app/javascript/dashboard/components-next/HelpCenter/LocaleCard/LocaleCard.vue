<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALE_MENU_ITEMS } from 'dashboard/helper/portalHelper';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  locale: {
    type: String,
    required: true,
  },
  isDefault: {
    type: Boolean,
    required: true,
  },
  localeCode: {
    type: String,
    required: true,
  },
  articleCount: {
    type: Number,
    required: true,
  },
  categoryCount: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['action']);

const { t } = useI18n();

const isOpen = ref(false);

const localeMenuItems = computed(() =>
  LOCALE_MENU_ITEMS.map(item => ({
    ...item,
    label: t(item.label),
    disabled: props.isDefault,
  }))
);

const handleAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value });
};
</script>

<template>
  <CardLayout>
    <div class="flex justify-between gap-2">
      <div class="flex items-center justify-start gap-2">
        <span class="text-sm font-medium text-n-slate-12 line-clamp-1">
          {{ locale }} ({{ localeCode }})
        </span>
        <span
          v-if="isDefault"
          class="bg-n-alpha-2 h-6 inline-flex items-center justify-center rounded-md text-xs border-px border-transparent text-n-blue-text px-2 py-0.5"
        >
          {{ $t('HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DEFAULT') }}
        </span>
      </div>
      <div class="flex items-center justify-end gap-4">
        <div class="flex items-center gap-4">
          <span class="text-sm text-n-slate-11 whitespace-nowrap">
            {{
              $t(
                'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.ARTICLES_COUNT',
                articleCount
              )
            }}
          </span>
          <div class="w-px h-3 bg-n-weak" />
          <span class="text-sm text-n-slate-11 whitespace-nowrap">
            {{
              $t(
                'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.CATEGORIES_COUNT',
                categoryCount
              )
            }}
          </span>
        </div>
        <Popover v-model:open="isOpen">
          <PopoverTrigger as-child>
            <Button variant="outline" size="icon">
              <Icon icon="i-lucide-ellipsis-vertical" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            class="flex flex-col p-1 w-auto min-w-36"
          >
            <Button
              v-for="item in localeMenuItems"
              :key="item.value"
              variant="ghost"
              class="justify-start"
              :class="
                item.action === 'delete'
                  ? 'text-destructive hover:text-destructive'
                  : ''
              "
              :disabled="item.disabled"
              @click="handleAction(item)"
            >
              <Icon
                v-if="item.icon"
                :icon="item.icon"
                class="size-3.5 flex-shrink-0"
              />
              <span v-if="item.emoji" class="flex-shrink-0">{{
                item.emoji
              }}</span>
              {{ item.label }}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  </CardLayout>
</template>
