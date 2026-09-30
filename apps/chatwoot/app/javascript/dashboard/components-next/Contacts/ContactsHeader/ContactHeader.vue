<script setup>
import { Button } from 'dashboard/components-next/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ContactSortMenu from './components/ContactSortMenu.vue';
import ContactMoreActions from './components/ContactMoreActions.vue';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';

defineProps({
  showSearch: { type: Boolean, default: true },
  searchValue: { type: String, default: '' },
  headerTitle: { type: String, required: true },
  buttonLabel: { type: String, default: '' },
  activeSort: { type: String, default: 'last_activity_at' },
  activeOrdering: { type: String, default: '' },
  isSegmentsView: { type: Boolean, default: false },
  hasActiveFilters: { type: Boolean, default: false },
  isLabelView: { type: Boolean, default: false },
  isActiveView: { type: Boolean, default: false },
});

const emit = defineEmits(['search', 'update:sort', 'add', 'import', 'export']);
</script>

<template>
  <header class="sticky top-0 z-10">
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full p-6 mx-auto max-w-[60rem]"
    >
      <span class="text-xl font-medium truncate min-w-0">
        {{ headerTitle }}
      </span>
      <div
        class="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto sm:shrink-0"
      >
        <InputGroup v-if="showSearch" class="w-full sm:w-64">
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="text-muted-foreground size-4" />
          </InputGroupAddon>
          <InputGroupInput
            :model-value="searchValue"
            :placeholder="$t('CONTACTS_LAYOUT.HEADER.SEARCH_PLACEHOLDER')"
            @input="emit('search', $event.target.value)"
          />
        </InputGroup>
        <div class="flex items-center flex-shrink-0 gap-4">
          <div class="flex items-center gap-2">
            <slot v-if="!isLabelView && !isActiveView" name="filter" />
            <slot
              v-if="
                hasActiveFilters &&
                !isSegmentsView &&
                !isLabelView &&
                !isActiveView
              "
              name="create-segment"
            />
            <slot
              v-if="isSegmentsView && !isLabelView && !isActiveView"
              name="delete-segment"
            />
            <ContactSortMenu
              :active-sort="activeSort"
              :active-ordering="activeOrdering"
              @update:sort="emit('update:sort', $event)"
            />
            <ContactMoreActions
              @add="emit('add')"
              @import="emit('import')"
              @export="emit('export')"
            />
          </div>
          <div class="w-px h-4 bg-n-strong" />
          <ComposeConversation>
            <template #trigger="{ toggle }">
              <Button variant="default" @click="toggle">{{
                buttonLabel
              }}</Button>
            </template>
          </ComposeConversation>
        </div>
      </div>
    </div>
  </header>
</template>
