<script setup>
import { computed, ref, watch } from 'vue';
import { picoSearch } from '@scmmishra/pico-search';

import Avatar from 'next/avatar/Avatar.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  searchPlaceholder: {
    type: String,
    default: '',
  },
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['add']);

const isOpen = ref(false);
const searchValue = ref('');

watch(isOpen, val => {
  if (!val) searchValue.value = '';
});

const filteredItems = computed(() => {
  if (!searchValue.value) return props.items;
  return picoSearch(props.items, searchValue.value.toLowerCase(), ['name']);
});

const handleAdd = item => {
  emit('add', item);
  isOpen.value = false;
};
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button variant="outline" type="button">
        <Icon icon="i-lucide-plus" />
        {{ label }}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      class="flex flex-col items-start gap-4 max-w-96 min-w-80 max-h-[20rem] overflow-y-auto py-2"
    >
      <div class="flex flex-col divide-y divide-n-slate-4 w-full">
        <InputGroup class="border-0">
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="text-muted-foreground size-4" />
          </InputGroupAddon>
          <InputGroupInput
            v-model="searchValue"
            :placeholder="searchPlaceholder"
          />
        </InputGroup>

        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="flex gap-3 min-w-0 w-full py-4 px-3 hover:bg-n-alpha-2 cursor-pointer"
          :class="{ 'items-center': item.color, 'items-start': !item.color }"
          @click="handleAdd(item)"
        >
          <Icon
            v-if="item.icon"
            :icon="item.icon"
            class="size-4 text-n-slate-12 flex-shrink-0 mt-0.5"
          />
          <span
            v-else-if="item.color"
            :style="{ backgroundColor: item.color }"
            class="size-3 rounded-sm"
          />
          <Avatar
            v-else
            :title="item.name"
            :src="item.avatarUrl"
            :name="item.name"
            :size="20"
            rounded-full
          />
          <div class="flex flex-col items-start gap-2 min-w-0 flex-1">
            <div class="flex items-center gap-1 min-w-0 w-full">
              <span
                :title="item.name || item.title"
                class="text-sm text-n-slate-12 truncate min-w-0 flex-1"
              >
                {{ item.name || item.title }}
              </span>
            </div>
            <span
              v-if="item.email || item.phoneNumber"
              :title="item.email || item.phoneNumber"
              class="text-sm text-n-slate-11 truncate min-w-0 w-full block"
            >
              {{ item.email || item.phoneNumber }}
            </span>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
