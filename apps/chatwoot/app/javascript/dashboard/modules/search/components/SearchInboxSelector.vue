<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store.js';
import { useCamelCase } from 'dashboard/composables/useTransformKeys';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';

const props = defineProps({
  label: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['change']);
const modelValue = defineModel({
  type: [String, Number],
  default: null,
});

const MENU_ITEM_TYPES = {
  INBOX: 'inbox',
};

const { t } = useI18n();

const searchQuery = ref('');

const inboxesList = useMapGetter('inboxes/getInboxes');

const inboxesSection = computed(() => {
  const inboxes = inboxesList.value?.map(inbox => {
    const transformedInbox = useCamelCase(inbox, { deep: true });
    return {
      label: transformedInbox.name,
      value: transformedInbox.id,
      type: MENU_ITEM_TYPES.INBOX,
      thumbnail: {
        name: transformedInbox.name,
        src: transformedInbox.avatarUrl,
      },
      isSelected: modelValue.value === transformedInbox.id,
    };
  });

  if (!searchQuery.value) return inboxes;

  return inboxes.filter(inbox =>
    inbox.label.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const selectedLabel = computed(() => {
  if (!modelValue.value) return props.label;

  // Find the selected inbox
  const inbox = inboxesList.value?.find(i => i.id === modelValue.value);
  if (inbox) return `${props.label}: ${inbox.name}`;

  return `${props.label}: ${modelValue.value}`;
});

const handleAction = item => {
  if (modelValue.value === item.value) {
    modelValue.value = null;
  } else {
    modelValue.value = item.value;
  }
  emit('change');
};

const onDropdownOpen = () => {
  searchQuery.value = '';
};
</script>

<template>
  <DropdownMenu
    @update:open="
      val => {
        if (val) onDropdownOpen();
      }
    "
  >
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="!px-2 max-w-full">
        <span class="truncate">{{ selectedLabel }}</span>
        <Icon icon="i-lucide-chevron-down" class="ml-1 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64 max-h-80 overflow-y-auto">
      <div class="sticky top-0 bg-n-alpha-3 backdrop-blur-sm mb-1">
        <InputGroup>
          <InputGroupAddon>
            <span class="i-lucide-search size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            :value="searchQuery"
            type="search"
            :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
            @input="searchQuery = $event.target.value"
          />
        </InputGroup>
      </div>
      <DropdownMenuLabel>{{ t('SEARCH.FILTERS.INBOXES') }}</DropdownMenuLabel>
      <div
        v-if="!inboxesSection.length"
        class="text-sm text-n-slate-11 px-2 py-1.5"
      >
        {{ t('SEARCH.FILTERS.NO_INBOXES') }}
      </div>
      <DropdownMenuItem
        v-for="item in inboxesSection"
        :key="item.value"
        :class="item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''"
        @select="handleAction(item)"
      >
        <Avatar
          v-if="item.thumbnail"
          :name="item.thumbnail.name"
          :src="item.thumbnail.src"
          :size="20"
          rounded-full
        />
        <span class="min-w-0 truncate">{{ item.label }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
