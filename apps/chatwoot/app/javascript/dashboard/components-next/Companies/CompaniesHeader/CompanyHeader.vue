<script setup>
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import CompanySortMenu from './components/CompanySortMenu.vue';

defineProps({
  showSearch: { type: Boolean, default: true },
  searchValue: { type: String, default: '' },
  headerTitle: { type: String, required: true },
  activeSort: { type: String, default: 'last_activity_at' },
  activeOrdering: { type: String, default: '' },
});

const emit = defineEmits(['search', 'update:sort']);
</script>

<template>
  <header class="sticky top-0 z-10">
    <div
      class="flex items-start sm:items-center justify-between w-full py-6 px-6 gap-2 mx-auto max-w-[60rem]"
    >
      <span class="text-xl font-medium truncate text-n-slate-12">
        {{ headerTitle }}
      </span>
      <div class="flex items-center flex-row flex-shrink-0 gap-2">
        <div class="flex items-center">
          <CompanySortMenu
            :active-sort="activeSort"
            :active-ordering="activeOrdering"
            @update:sort="emit('update:sort', $event)"
          />
        </div>
        <InputGroup v-if="showSearch" class="w-full">
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="text-muted-foreground size-4" />
          </InputGroupAddon>
          <InputGroupInput
            :model-value="searchValue"
            :placeholder="$t('CONTACTS_LAYOUT.HEADER.SEARCH_PLACEHOLDER')"
            @input="emit('search', $event.target.value)"
          />
        </InputGroup>
      </div>
    </div>
  </header>
</template>
