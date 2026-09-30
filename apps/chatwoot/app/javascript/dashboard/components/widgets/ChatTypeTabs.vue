<script setup>
import { computed } from 'vue';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import wootConstants from 'dashboard/constants/globals';
import { Tabs, TabsList, TabsTrigger } from 'dashboard/components-next/ui/tabs';

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  activeTab: {
    type: String,
    default: wootConstants.ASSIGNEE_TYPE.ME,
  },
});

const emit = defineEmits(['chatTabChange']);

const activeTabIndex = computed(() => {
  return props.items.findIndex(item => item.key === props.activeTab);
});

const onTabChange = selectedTabIndex => {
  if (selectedTabIndex >= 0 && selectedTabIndex < props.items.length) {
    const selectedItem = props.items[selectedTabIndex];
    if (selectedItem.key !== props.activeTab) {
      emit('chatTabChange', selectedItem.key);
    }
  }
};

const keyboardEvents = {
  'Alt+KeyN': {
    action: () => {
      if (props.activeTab === wootConstants.ASSIGNEE_TYPE.ALL) {
        onTabChange(0);
      } else {
        const nextIndex = (activeTabIndex.value + 1) % props.items.length;
        onTabChange(nextIndex);
      }
    },
  },
};

useKeyboardEvents(keyboardEvents);
</script>

<template>
  <Tabs
    :model-value="String(activeTabIndex)"
    class="w-full px-2 pb-2 border-b border-border"
    @update:model-value="val => onTabChange(Number(val))"
  >
    <TabsList
      class="flex flex-col w-full h-auto gap-1 justify-start sm:flex-row"
    >
      <TabsTrigger
        v-for="(item, index) in items"
        :key="item.key"
        :value="String(index)"
        class="flex-1 w-full min-w-0 gap-1.5 text-sm font-medium sm:w-auto"
      >
        <span class="truncate">{{ item.name }}</span>
        <div
          v-if="item.count"
          class="shrink-0 min-w-5 h-5 px-1 rounded-full flex items-center justify-center"
          :class="item.key === activeTab ? 'bg-primary/20' : 'bg-input'"
        >
          <span
            class="text-xxs font-bold leading-none"
            :class="
              item.key === activeTab ? 'text-primary' : 'text-muted-foreground'
            "
          >
            {{ item.count }}
          </span>
        </div>
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
