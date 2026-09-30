<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter, useStore } from 'dashboard/composables/store.js';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';

const emit = defineEmits(['close', 'createAssistant']);

const { t } = useI18n();
const { visit, currentParams, currentRouteName } = useAppNavigation();
const store = useStore();

const assistants = useMapGetter('captainAssistants/getRecords');

const currentAssistantId = computed(() => currentParams.value.assistantId);

const isAssistantActive = assistant => {
  return assistant.id === Number(currentAssistantId.value);
};

const fetchDataForRoute = async (routeName, assistantId) => {
  const dataFetchMap = {
    captain_assistants_documents_index: async () => {
      await store.dispatch('captainDocuments/get', { assistantId });
    },
    captain_assistants_scenarios_index: async () => {
      await store.dispatch('captainScenarios/get', { assistantId });
    },
    captain_assistants_playground_index: () => {
      // Playground doesn't need pre-fetching, it loads on interaction
    },
    captain_assistants_inboxes_index: async () => {
      await store.dispatch('captainInboxes/get', { assistantId });
    },
    captain_tools_index: async () => {
      await store.dispatch('captainCustomTools/get', { page: 1 });
    },
    captain_assistants_settings_index: async () => {
      await store.dispatch('captainAssistants/show', assistantId);
    },
  };

  const fetchFn = dataFetchMap[routeName];
  if (fetchFn) {
    await fetchFn();
  }
};

const handleAssistantChange = async assistant => {
  if (isAssistantActive(assistant)) return;

  const activeRouteName = currentRouteName.value;
  const targetRouteName =
    activeRouteName || 'captain_assistants_overview_index';

  await fetchDataForRoute(targetRouteName, assistant.id);

  visit({
    name: targetRouteName,
    params: {
      accountId: currentParams.value.accountId,
      assistantId: assistant.id,
    },
  });

  emit('close');
};

const openCreateAssistantDialog = () => {
  emit('createAssistant');
  emit('close');
};
</script>

<template>
  <div
    class="pt-5 bg-n-alpha-3 backdrop-blur-[100px] outline outline-n-container outline-1 w-[27.5rem] max-h-96 rounded-xl shadow-md flex flex-col gap-4"
  >
    <div
      class="flex items-center justify-between gap-4 px-6 pb-3 border-b border-n-alpha-2"
    >
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <h2
            class="text-base font-medium cursor-pointer text-n-slate-12 w-fit hover:underline"
          >
            {{ t('CAPTAIN.ASSISTANT_SWITCHER.ASSISTANTS') }}
          </h2>
        </div>
        <p class="text-sm text-n-slate-11">
          {{ t('CAPTAIN.ASSISTANT_SWITCHER.SWITCH_ASSISTANT') }}
        </p>
      </div>
      <Button
        variant="outline"
        class="!bg-n-alpha-2 hover:!bg-n-alpha-3"
        @click="openCreateAssistantDialog"
      >
        <Icon icon="i-lucide-plus" class="size-4" />
        {{ t('CAPTAIN.ASSISTANT_SWITCHER.NEW_ASSISTANT') }}
      </Button>
    </div>
    <div
      v-if="assistants.length > 0"
      class="flex flex-col flex-1 min-h-0 gap-2 px-4 pb-3 overflow-y-auto overscroll-contain"
    >
      <Button
        v-for="assistant in assistants"
        :key="assistant.id"
        variant="ghost"
        class="!justify-end !px-2 !py-2 hover:!bg-n-alpha-2 [&>.i-lucide-check]:text-n-teal-10 h-9"
        @click="handleAssistantChange(assistant)"
      >
        <span class="text-sm font-medium truncate text-n-slate-12">
          {{ assistant.name || '' }}
        </span>
        <Avatar
          v-if="assistant"
          :name="assistant.name"
          :size="20"
          icon-name="i-lucide-bot"
          rounded-full
        />
        <Icon
          v-if="isAssistantActive(assistant)"
          icon="i-lucide-check"
          class="size-4"
        />
      </Button>
    </div>
    <div v-else class="flex flex-col items-center gap-2 px-4 py-3">
      <p class="text-sm text-n-slate-11">
        {{ t('CAPTAIN.ASSISTANT_SWITCHER.EMPTY_LIST') }}
      </p>
    </div>
  </div>
</template>
