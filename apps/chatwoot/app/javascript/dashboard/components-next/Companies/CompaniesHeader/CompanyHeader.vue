<script setup>
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import CompanySortMenu from './components/CompanySortMenu.vue';
import CompanyMoreActions from './components/CompanyMoreActions.vue';

defineProps({
  showSearch: { type: Boolean, default: true },
  searchValue: { type: String, default: '' },
  headerTitle: { type: String, required: true },
  activeSort: { type: String, default: 'last_activity_at' },
  activeOrdering: { type: String, default: '' },
});

const emit = defineEmits(['search', 'update:sort', 'create']);
</script>

<template>
  <header class="sticky top-0 z-10 px-6">
    <div
      class="flex items-start sm:items-center justify-between w-full py-6 gap-2 mx-auto max-w-5xl"
    >
      <span class="text-xl font-medium truncate text-n-slate-12">
        {{ headerTitle }}
      </span>
      <div class="flex items-center flex-col sm:flex-row flex-shrink-0 gap-4">
        <InputGroup v-if="showSearch" class="w-full">
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="text-muted-foreground size-4" />
          </InputGroupAddon>
          <InputGroupInput
            :model-value="searchValue"
            :placeholder="$t('COMPANIES.SEARCH_PLACEHOLDER')"
            @input="emit('search', $event.target.value)"
          />
        </InputGroup>
        <div class="flex items-center flex-shrink-0 gap-2">
          <CompanySortMenu
            :active-sort="activeSort"
            :active-ordering="activeOrdering"
            @update:sort="emit('update:sort', $event)"
          />
          <CompanyMoreActions @create="emit('create')" />
        </div>
      </div>
    </div>
  </header>
</template>
