<script setup>
import { ref, computed, useSlots, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from 'dashboard/components-next/ui/dropdown-menu';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';

const props = defineProps({
  menuItems: {
    type: Array,
    default: () => [],
  },
  menuSections: {
    type: Array,
    default: () => [],
  },
  thumbnailSize: { type: Number, default: 20 },
  roundedThumbnail: { type: Boolean, default: true },
  showSearch: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: '' },
  isSearching: { type: Boolean, default: false },
  labelClass: { type: String, default: '' },
  disableLocalFiltering: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  emptyStateMessage: { type: String, default: 'DROPDOWN_MENU.EMPTY_STATE' },
  open: { type: Boolean, default: undefined },
  align: { type: String, default: 'end' },
  side: { type: String, default: 'bottom' },
});

const emit = defineEmits(['action', 'search', 'empty', 'update:open']);

const { t } = useI18n();
const slots = useSlots();
const searchInput = ref(null);
const searchQuery = ref('');

const hasTrigger = computed(() => !!slots.trigger);
const isControlled = computed(() => props.open !== undefined);
const internalOpen = ref(false);
const isOpen = computed(() =>
  isControlled.value ? props.open : internalOpen.value
);

const handleOpenChange = val => {
  if (isControlled.value) {
    emit('update:open', val);
  } else {
    internalOpen.value = val;
  }
};

const hasSections = computed(() => props.menuSections.length > 0);

const flattenedMenuItems = computed(() => {
  if (!hasSections.value) return props.menuItems;
  return props.menuSections.flatMap(section => section.items || []);
});

const filteredMenuItems = computed(() => {
  if (props.disableLocalFiltering) return props.menuItems;
  if (!searchQuery.value) return flattenedMenuItems.value;
  return flattenedMenuItems.value.filter(item =>
    item.label.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const filteredMenuSections = computed(() => {
  if (!hasSections.value) return [];
  if (props.disableLocalFiltering || !searchQuery.value)
    return props.menuSections;
  const query = searchQuery.value.toLowerCase();
  return props.menuSections
    .map(section => ({
      ...section,
      items: (section.items || []).filter(item =>
        item.label.toLowerCase().includes(query)
      ),
    }))
    .filter(section => section.items.length > 0);
});

const shouldShowEmptyState = computed(() => {
  if (hasSections.value) return filteredMenuSections.value.length === 0;
  return filteredMenuItems.value.length === 0;
});

const handleSearchInput = event => {
  emit('search', event.target.value);

  const isEmpty = hasSections.value
    ? filteredMenuSections.value.length === 0
    : filteredMenuItems.value.length === 0;

  if (isEmpty) emit('empty');
};

const handleAction = item => {
  const { action, value, ...rest } = item;
  emit('action', { action, value, ...rest });
};

watch(isOpen, val => {
  if (val && props.showSearch && searchInput.value) {
    const el = searchInput.value?.$el ?? searchInput.value;
    el?.focus?.();
  }
});
</script>

<template>
  <DropdownMenuRoot :open="isOpen" @update:open="handleOpenChange">
    <DropdownMenuTrigger v-if="hasTrigger" as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" :side="side">
      <div
        v-if="showSearch"
        class="sticky top-0 bg-n-alpha-3 backdrop-blur-sm mb-1"
      >
        <InputGroup>
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            ref="searchInput"
            v-model="searchQuery"
            :placeholder="
              searchPlaceholder || t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')
            "
            @input="handleSearchInput"
          />
        </InputGroup>
      </div>
      <template v-if="hasSections">
        <div
          v-for="(section, sectionIndex) in filteredMenuSections"
          :key="section.title || sectionIndex"
          class="flex flex-col gap-1"
        >
          <DropdownMenuLabel v-if="section.title" class="truncate min-w-0">
            {{ section.title }}
          </DropdownMenuLabel>
          <div
            v-if="section.isLoading"
            class="flex items-center justify-center py-2"
          >
            <Spinner class="size-6" />
          </div>
          <div
            v-else-if="!section.items.length && section.emptyState"
            class="text-sm text-n-slate-11 px-2 py-1.5"
          >
            {{ section.emptyState }}
          </div>
          <DropdownMenuItem
            v-for="(item, itemIndex) in section.items"
            :key="item.value || itemIndex"
            :disabled="item.disabled"
            :variant="item.action === 'delete' ? 'destructive' : 'default'"
            :class="
              item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''
            "
            @select="handleAction(item)"
          >
            <slot name="thumbnail" :item="item">
              <Avatar
                v-if="item.thumbnail"
                :name="item.thumbnail.name"
                :src="item.thumbnail.src"
                :size="thumbnailSize"
                :rounded-full="roundedThumbnail"
              />
            </slot>
            <slot name="icon" :item="item">
              <Icon
                v-if="item.icon"
                :icon="item.icon"
                class="flex-shrink-0 size-3.5"
              />
            </slot>
            <EmojiIcon
              v-if="item.emoji"
              :value="item.emoji"
              :color="item.iconColor"
              class="flex-shrink-0 size-4"
            />
            <slot name="label" :item="item">
              <span
                v-if="item.label"
                class="min-w-0 text-sm font-420 truncate"
                :class="labelClass"
              >
                {{ item.label }}
              </span>
            </slot>
            <slot name="trailing-icon" :item="item" />
          </DropdownMenuItem>
          <DropdownMenuSeparator
            v-if="sectionIndex < filteredMenuSections.length - 1"
          />
        </div>
      </template>
      <template v-else>
        <div v-if="isLoading" class="flex items-center justify-center py-2">
          <Spinner class="size-6" />
        </div>
        <DropdownMenuItem
          v-for="(item, index) in filteredMenuItems"
          :key="index"
          :disabled="item.disabled"
          :variant="item.action === 'delete' ? 'destructive' : 'default'"
          :class="item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''"
          @select="handleAction(item)"
        >
          <slot name="thumbnail" :item="item">
            <Avatar
              v-if="item.thumbnail"
              :name="item.thumbnail.name"
              :src="item.thumbnail.src"
              :size="thumbnailSize"
              :rounded-full="roundedThumbnail"
            />
          </slot>
          <slot name="icon" :item="item">
            <Icon
              v-if="item.icon"
              :icon="item.icon"
              class="flex-shrink-0 size-3.5"
            />
          </slot>
          <EmojiIcon
            v-if="item.emoji"
            :value="item.emoji"
            :color="item.iconColor"
            class="flex-shrink-0 size-4"
          />
          <slot name="label" :item="item">
            <span
              v-if="item.label"
              class="min-w-0 text-sm font-420 truncate"
              :class="labelClass"
            >
              {{ item.label }}
            </span>
          </slot>
          <slot name="trailing-icon" :item="item" />
        </DropdownMenuItem>
      </template>
      <div
        v-if="shouldShowEmptyState"
        class="text-sm text-n-slate-11 px-2 py-1.5"
      >
        {{
          isSearching
            ? t('DROPDOWN_MENU.SEARCHING')
            : searchQuery
              ? t('DROPDOWN_MENU.EMPTY_STATE')
              : t(emptyStateMessage)
        }}
      </div>
      <slot name="footer" />
    </DropdownMenuContent>
  </DropdownMenuRoot>
</template>
