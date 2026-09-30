<script setup>
import EmptyState from 'dashboard/components/widgets/EmptyState.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
import { computed, onMounted } from 'vue';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { useMapGetter } from 'dashboard/composables/store';

const { isAdmin } = useAdmin();
const isOnChatwootCloud = useMapGetter('globalConfig/isOnChatwootCloud');

const showBillingLink = computed(
  () => isAdmin.value && isOnChatwootCloud.value
);

const toggleSupportWidgetVisibility = () => {
  if (window.$chatwoot) {
    window.$chatwoot.toggleBubbleVisibility('show');
  }
};

const toggleSupportWidget = () => {
  if (window.$chatwoot) {
    window.$chatwoot.toggle();
  }
};

const setupListenerForWidgetEvent = () => {
  window.addEventListener('chatwoot:on-message', () => {
    toggleSupportWidgetVisibility();
  });
};

onMounted(() => {
  toggleSupportWidgetVisibility();
  setupListenerForWidgetEvent();
});
</script>

<template>
  <div class="items-center bg-n-slate-2 flex justify-center h-full w-full">
    <EmptyState
      class="max-w-lg"
      :title="$t('APP_GLOBAL.ACCOUNT_SUSPENDED.TITLE')"
      :message="$t('APP_GLOBAL.ACCOUNT_SUSPENDED.MESSAGE')"
    >
      <div class="flex flex-col items-center gap-3 mt-4">
        <Button @click="toggleSupportWidget">
          <Icon icon="i-lucide-life-buoy" />
          {{ $t('SIDEBAR_ITEMS.CONTACT_SUPPORT') }}
        </Button>
        <AppLink
          v-if="showBillingLink"
          :to="{ name: 'billing_settings_index' }"
          class="text-sm text-n-slate-11 hover:text-n-slate-12 hover:underline"
        >
          {{ $t('APP_GLOBAL.ACCOUNT_SUSPENDED.MANAGE_BILLING') }}
        </AppLink>
      </div>
    </EmptyState>
  </div>
</template>
