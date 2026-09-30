<script setup>
import { computed, ref } from 'vue';
import { useI18n, I18nT } from 'vue-i18n';
import { useStore } from 'vuex';
import { useMapGetter } from 'dashboard/composables/store';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from 'dashboard/components-next/ui/command';

const props = defineProps({
  selectedInboxes: {
    type: Array,
    default: () => [],
  },
  conversationCount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['select']);

const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);
const selectedAgent = ref(null);

const assignableAgentsUiFlags = useMapGetter(
  'inboxAssignableAgents/getUIFlags'
);
const bulkActionsUiFlags = useMapGetter('bulkActions/getUIFlags');

const isLoading = computed(() => assignableAgentsUiFlags.value.isFetching);
const isUpdating = computed(() => bulkActionsUiFlags.value.isUpdating);

const assignableAgentsList = useMapGetter(
  'inboxAssignableAgents/getAssignableAgents'
);
const assignableAgents = computed(() =>
  assignableAgentsList.value(props.selectedInboxes.join(','))
);

const noneOption = computed(() => ({
  id: null,
  name: t('BULK_ACTION.NONE'),
}));

const isSelected = agent =>
  selectedAgent.value !== null && selectedAgent.value.id === agent.id;

const handleSelectAgent = agent => {
  selectedAgent.value = agent;
};

const handleCancel = () => {
  selectedAgent.value = null;
};

const onOpenChange = value => {
  isOpen.value = value;
  if (!value) {
    selectedAgent.value = null;
    return;
  }
  if (props.selectedInboxes.length > 0) {
    store.dispatch('inboxAssignableAgents/fetch', props.selectedInboxes);
  }
};

const handleAssign = () => {
  if (isUpdating.value) return;
  emit('select', selectedAgent.value);
  onOpenChange(false);
};
</script>

<template>
  <Popover :open="isOpen" @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <Button
        v-tooltip="$t('BULK_ACTION.ASSIGN_AGENT_TOOLTIP')"
        variant="outline"
        size="icon"
        :class="{ 'bg-n-alpha-2': isOpen }"
      >
        <Icon icon="i-lucide-user-round-check" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-60 p-0">
      <Command>
        <CommandInput
          :placeholder="t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
        />
        <CommandList class="max-h-60">
          <div v-if="isLoading" class="flex justify-center py-3">
            <Spinner class="size-4" />
          </div>
          <template v-else>
            <CommandEmpty>
              {{ t('BULK_ACTION.AGENT_LIST_LOADING') }}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                :value="noneOption.name"
                @select="handleSelectAgent(noneOption)"
              >
                <Avatar :name="noneOption.name" :size="20" rounded-full />
                <span class="flex-1 min-w-0 truncate">
                  {{ noneOption.name }}
                </span>
                <Icon
                  v-if="isSelected(noneOption)"
                  icon="i-lucide-check"
                  class="size-4 flex-shrink-0"
                />
              </CommandItem>
              <CommandItem
                v-for="agent in assignableAgents"
                :key="agent.id"
                :value="`${agent.name} ${agent.id}`"
                @select="handleSelectAgent(agent)"
              >
                <Avatar
                  :name="agent.name"
                  :src="agent.thumbnail"
                  :size="20"
                  rounded-full
                />
                <span class="flex-1 min-w-0 truncate">{{ agent.name }}</span>
                <Icon
                  v-if="isSelected(agent)"
                  icon="i-lucide-check"
                  class="size-4 flex-shrink-0"
                />
              </CommandItem>
            </CommandGroup>
          </template>
        </CommandList>
      </Command>
      <div
        v-if="selectedAgent"
        class="flex flex-col gap-2 p-2 border-t border-border"
      >
        <I18nT
          v-if="selectedAgent.id"
          keypath="BULK_ACTION.ASSIGN_AGENT_CONFIRMATION_LABEL"
          tag="p"
          class="text-xs text-n-slate-11 px-1 mb-0"
          :plural="conversationCount"
        >
          <template #n>
            <strong class="text-n-slate-12">{{ conversationCount }}</strong>
          </template>
          <template #agentName>
            <strong class="text-n-slate-12">{{ selectedAgent.name }}</strong>
          </template>
        </I18nT>
        <I18nT
          v-else
          keypath="BULK_ACTION.UNASSIGN_AGENT_CONFIRMATION_LABEL"
          tag="p"
          class="text-xs text-n-slate-11 px-1 mb-0"
          :plural="conversationCount"
        >
          <template #n>
            <strong class="text-n-slate-12">{{ conversationCount }}</strong>
          </template>
        </I18nT>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            class="flex-1"
            @click="handleCancel"
          >
            {{ t('BULK_ACTION.CANCEL') }}
          </Button>
          <Button
            size="sm"
            class="flex-1"
            :disabled="isUpdating"
            @click="handleAssign"
          >
            <Spinner v-if="isUpdating" class="size-4" />
            {{ t('BULK_ACTION.YES') }}
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
