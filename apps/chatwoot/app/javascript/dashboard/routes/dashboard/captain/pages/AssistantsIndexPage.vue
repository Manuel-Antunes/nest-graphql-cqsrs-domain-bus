<script setup>
import { computed, nextTick, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useUISettings } from 'dashboard/composables/useUISettings';

import { Spinner } from 'dashboard/components-next/ui/spinner';

const store = useStore();
const { visit, currentParams } = useAppNavigation();
const { uiSettings } = useUISettings();

const assistants = computed(
  () => store.getters['captainAssistants/getRecords']
);

const isAssistantPresent = assistantId => {
  return !!assistants.value.find(a => a.id === Number(assistantId));
};

const routeToView = (name, params) => {
  visit({ name, params });
};

const generateRouterParams = () => {
  const { last_active_assistant_id: lastActiveAssistantId } =
    uiSettings.value || {};

  if (isAssistantPresent(lastActiveAssistantId)) {
    return {
      assistantId: lastActiveAssistantId,
    };
  }

  if (assistants.value.length > 0) {
    const { id: assistantId } = assistants.value[0];
    return { assistantId };
  }

  return null;
};

const routeToLastActiveAssistant = () => {
  const params = generateRouterParams();

  // No assistants found, redirect to create page
  if (!params) {
    return routeToView('captain_assistants_create_index', {
      accountId: currentParams.value.accountId,
    });
  }

  const { navigationPath } = currentParams.value;
  const isAValidRoute = [
    'captain_assistants_responses_index', // Faq page
    'captain_assistants_documents_index', // Document page
    'captain_assistants_scenarios_index', // Scenario page
    'captain_assistants_playground_index', // Playground page
    'captain_assistants_inboxes_index', // Inboxes page
    'captain_tools_index', // Tools page
    'captain_assistants_settings_index', // Settings page
  ].includes(navigationPath);

  const navigateTo = isAValidRoute
    ? navigationPath
    : 'captain_assistants_responses_index';

  return routeToView(navigateTo, {
    accountId: currentParams.value.accountId,
    ...params,
  });
};

const performRouting = async () => {
  await store.dispatch('captainAssistants/get');
  nextTick(() => routeToLastActiveAssistant());
};

onMounted(() => performRouting());
</script>

<template>
  <div
    class="flex items-center justify-center w-full bg-n-background text-n-slate-11"
  >
    <Spinner class="size-6" />
  </div>
</template>
