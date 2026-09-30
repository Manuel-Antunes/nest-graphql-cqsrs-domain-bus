<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildLocaleMenuItems } from 'dashboard/helper/portalHelper';

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
  isDraft: {
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

const localeLabel = computed(() => `${props.locale} (${props.localeCode})`);

const localeMenuLabels = computed(() => ({
  'change-default': t(
    'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DROPDOWN_MENU.MAKE_DEFAULT'
  ),
  'move-to-draft': t(
    'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DROPDOWN_MENU.MOVE_TO_DRAFT'
  ),
  'publish-locale': t(
    'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DROPDOWN_MENU.PUBLISH_LOCALE'
  ),
  'customize-content': t(
    'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DROPDOWN_MENU.CUSTOMIZE_CONTENT'
  ),
  'select-popular-content': t(
    'HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DROPDOWN_MENU.SELECT_POPULAR_CONTENT'
  ),
  delete: t('HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DROPDOWN_MENU.DELETE'),
}));

const localeMenuItems = computed(() =>
  buildLocaleMenuItems({
    isDefault: props.isDefault,
    isDraft: props.isDraft,
  }).map(item => ({
    ...item,
    label: localeMenuLabels.value[item.action],
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
          {{ localeLabel }}
        </span>
        <span
          v-if="isDefault"
          class="bg-n-alpha-2 h-6 inline-flex items-center justify-center rounded-md text-xs border-px border-transparent text-n-blue-11 px-2 py-0.5"
        >
          {{ $t('HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DEFAULT') }}
        </span>
        <span
          v-else-if="isDraft"
          class="bg-n-alpha-2 h-6 inline-flex items-center justify-center rounded-md text-xs border-px border-transparent text-n-slate-11 px-2 py-0.5"
        >
          {{ $t('HELP_CENTER.LOCALES_PAGE.LOCALE_CARD.DRAFT') }}
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
        <Popover v-if="localeMenuItems.length" v-model:open="isOpen">
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
