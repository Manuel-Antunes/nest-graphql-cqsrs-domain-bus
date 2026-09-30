<script setup>
import { computed } from 'vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ButtonGroup from 'dashboard/components-next/buttonGroup/ButtonGroup.vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

defineProps({
  isMobileSidebarOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['toggle']);

const { currentRouteName } = useAppNavigation();

const isConversationRoute = computed(() => {
  const CONVERSATION_ROUTES = [
    'inbox_conversation',
    'conversation_through_inbox',
    'conversations_through_label',
    'team_conversations_through_label',
    'conversations_through_folders',
    'conversation_through_mentions',
    'conversation_through_unattended',
    'conversation_through_participating',
    'inbox_view_conversation',
  ];
  return CONVERSATION_ROUTES.includes(currentRouteName.value);
});

const toggleSidebar = () => {
  emit('toggle');
};
</script>

<template>
  <div
    v-if="!isConversationRoute"
    id="mobile-sidebar-launcher"
    class="fixed bottom-20 ltr:left-4 rtl:right-4 z-50 transition-transform duration-200 ease-out block md:hidden"
    :class="[
      {
        // When the sidebar is open, sit just past the 64px icon rail (not 160px away).
        'ltr:translate-x-[3.75rem] rtl:-translate-x-[3.75rem]':
          isMobileSidebarOpen,
      },
    ]"
  >
    <Button size="icon" @click="toggleSidebar">
      <Icon icon="i-lucide-menu" />
    </Button>
  </div>
  <template v-else />
</template>
