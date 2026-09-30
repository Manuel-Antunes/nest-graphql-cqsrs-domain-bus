<script setup>
import { computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ButtonGroup from 'dashboard/components-next/buttonGroup/ButtonGroup.vue';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useMapGetter } from 'dashboard/composables/store';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';
const { currentRouteName } = useAppNavigation();

const { uiSettings, updateUISettings } = useUISettings();

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

const currentAccountId = useMapGetter('getCurrentAccountId');
const isFeatureEnabledonAccount = useMapGetter(
  'accounts/isFeatureEnabledonAccount'
);

const showCopilotLauncher = computed(() => {
  const isCaptainEnabled = isFeatureEnabledonAccount.value(
    currentAccountId.value,
    FEATURE_FLAGS.CAPTAIN
  );
  return (
    isCaptainEnabled &&
    !uiSettings.value.is_copilot_panel_open &&
    !isConversationRoute.value
  );
});
const toggleSidebar = () => {
  updateUISettings({
    is_copilot_panel_open: !uiSettings.value.is_copilot_panel_open,
    is_contact_sidebar_open: false,
  });
};
</script>

<template>
  <div
    v-if="showCopilotLauncher"
    class="fixed bottom-4 ltr:right-4 rtl:left-4 z-50"
  >
    <ButtonGroup
      class="rounded-full bg-n-alpha-2 backdrop-blur-lg p-1 shadow hover:shadow-md"
    >
      <Button
        variant="default"
        size="icon"
        class="!rounded-full transition-all duration-200 ease-out hover:brightness-110"
        @click="toggleSidebar"
      >
        <Icon icon="i-woot-captain" class="size-4" />
      </Button>
    </ButtonGroup>
  </div>
  <template v-else />
</template>
