<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import { SIDEBAR_SORT_KEYS } from 'dashboard/helper/sidebarSort';

const props = defineProps({
  activeSort: {
    type: String,
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
  openOnHover: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['sort', 'toggle']);

const SORT_OPTION_GROUPS = [
  {
    key: 'created',
    options: [SIDEBAR_SORT_KEYS.CREATED_DESC, SIDEBAR_SORT_KEYS.CREATED_ASC],
  },
  {
    key: 'alphabetical',
    options: [
      SIDEBAR_SORT_KEYS.ALPHABETICAL_ASC,
      SIDEBAR_SORT_KEYS.ALPHABETICAL_DESC,
    ],
  },
  {
    key: 'unread_count',
    options: [
      SIDEBAR_SORT_KEYS.UNREAD_COUNT_DESC,
      SIDEBAR_SORT_KEYS.UNREAD_COUNT_ASC,
    ],
  },
];

const { t } = useI18n();
const isOpen = ref(false);
let closeTimer;

const getSortOptionLabel = option => {
  if (option === SIDEBAR_SORT_KEYS.CREATED_DESC) {
    return t('SIDEBAR.SORT_OPTIONS.CREATED_DESC');
  }

  if (option === SIDEBAR_SORT_KEYS.CREATED_ASC) {
    return t('SIDEBAR.SORT_OPTIONS.CREATED_ASC');
  }

  if (option === SIDEBAR_SORT_KEYS.ALPHABETICAL_ASC) {
    return t('SIDEBAR.SORT_OPTIONS.ALPHABETICAL_ASC');
  }

  if (option === SIDEBAR_SORT_KEYS.ALPHABETICAL_DESC) {
    return t('SIDEBAR.SORT_OPTIONS.ALPHABETICAL_DESC');
  }

  if (option === SIDEBAR_SORT_KEYS.UNREAD_COUNT_DESC) {
    return t('SIDEBAR.SORT_OPTIONS.UNREAD_COUNT_DESC');
  }

  if (option === SIDEBAR_SORT_KEYS.UNREAD_COUNT_ASC) {
    return t('SIDEBAR.SORT_OPTIONS.UNREAD_COUNT_ASC');
  }

  return '';
};

const getSortGroupLabel = groupKey => {
  if (groupKey === 'created') {
    return t('SIDEBAR.SORT_GROUPS.CREATED');
  }

  if (groupKey === 'alphabetical') {
    return t('SIDEBAR.SORT_GROUPS.ALPHABETICAL');
  }

  if (groupKey === 'unread_count') {
    return t('SIDEBAR.SORT_GROUPS.UNREAD_COUNT');
  }

  return '';
};

const sortMenuSections = computed(() =>
  SORT_OPTION_GROUPS.map(group => ({
    title: getSortGroupLabel(group.key),
    items: group.options
      .filter(option => props.options.includes(option))
      .map(option => ({
        label: getSortOptionLabel(option),
        value: option,
        isActive: option === props.activeSort,
      })),
  })).filter(section => section.items.length)
);

const clearCloseTimer = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

const setOpen = value => {
  clearCloseTimer();
  isOpen.value = value;
  emit('toggle', value);
};

const scheduleClose = () => {
  clearCloseTimer();
  closeTimer = setTimeout(() => setOpen(false), 150);
};

const handleTriggerEnter = () => {
  if (props.openOnHover) setOpen(true);
};

const handleTriggerLeave = () => {
  if (props.openOnHover) scheduleClose();
};

const handleSortChange = value => {
  emit('sort', value);
  setOpen(false);
};

onBeforeUnmount(clearCloseTimer);
</script>

<template>
  <Popover :open="isOpen" @update:open="setOpen">
    <div
      class="relative invisible flex-shrink-0 opacity-0 pointer-events-none transition-opacity duration-150 group-hover/sidebar-section:visible group-hover/sidebar-section:opacity-100 group-hover/sidebar-section:pointer-events-auto"
      :class="{ '!visible !opacity-100 !pointer-events-auto': isOpen }"
      @mouseenter="handleTriggerEnter"
      @mouseleave="handleTriggerLeave"
    >
      <PopoverTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :title="t('SIDEBAR.SORT_TOOLTIP')"
          class="size-6 text-n-slate-11 hover:text-n-slate-12"
          :class="{ 'bg-n-alpha-2': isOpen }"
          @click.stop
        >
          <Icon icon="i-lucide-arrow-up-down" class="size-3.5" />
        </Button>
      </PopoverTrigger>
    </div>
    <PopoverContent
      align="start"
      disable-portal
      data-popover-content
      class="flex flex-col w-60 p-1"
      @mouseenter="clearCloseTimer"
      @mouseleave="handleTriggerLeave"
    >
      <div
        v-for="section in sortMenuSections"
        :key="section.title"
        class="flex flex-col"
      >
        <span class="px-2 pt-2 pb-1 text-xs font-medium text-n-slate-10">
          {{ section.title }}
        </span>
        <button
          v-for="item in section.items"
          :key="item.value"
          type="button"
          class="flex items-center w-full gap-2 px-2 py-1.5 text-sm rounded-md text-n-slate-12 hover:bg-n-alpha-2"
          @click="handleSortChange(item.value)"
        >
          <span class="flex-1 min-w-0 truncate text-start">
            {{ item.label }}
          </span>
          <Icon
            v-if="item.isActive"
            icon="i-lucide-check"
            class="flex-shrink-0 size-4 text-n-slate-11"
          />
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
