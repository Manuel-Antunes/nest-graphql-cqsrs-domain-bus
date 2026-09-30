<script setup>
import { computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

const emit = defineEmits(['openNotificationPanel']);

const notificationMetadata = useMapGetter('notifications/getMeta');
const { currentRouteName } = useAppNavigation();
const unreadCount = computed(() => {
  if (!notificationMetadata.value.unreadCount) {
    return '';
  }

  return notificationMetadata.value.unreadCount < 100
    ? `${notificationMetadata.value.unreadCount}`
    : '99+';
});

function openNotificationPanel() {
  if (currentRouteName.value !== 'notifications_index') {
    emit('openNotificationPanel');
  }
}
</script>

<template>
  <button
    class="size-8 rounded-lg hover:bg-n-alpha-1 flex-shrink-0 grid place-content-center relative"
    @click="openNotificationPanel"
  >
    <span class="i-lucide-bell size-4" />
    <span
      v-if="unreadCount"
      class="min-h-2 min-w-2 p-0.5 px-1 bg-n-ruby-9 rounded-lg absolute -top-1 -right-1.5 grid place-items-center text-[9px] leading-none text-n-ruby-3"
    >
      {{ unreadCount }}
    </span>
  </button>
</template>
