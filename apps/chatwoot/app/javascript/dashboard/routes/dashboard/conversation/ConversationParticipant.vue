<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { useAgentsList } from 'dashboard/composables/useAgentsList';
import { useAlert } from 'dashboard/composables';

import Spinner from 'shared/components/Spinner.vue';
import ThumbnailGroup from 'dashboard/components/widgets/ThumbnailGroup.vue';
import Avatar from 'next/avatar/Avatar.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Popover, PopoverTrigger, PopoverContent } from 'next/ui/popover';

const props = defineProps({
  conversationId: {
    type: [Number, String],
    required: true,
  },
});

const { t } = useI18n();
const store = useStore();
const { agentsList } = useAgentsList(false);

const currentUser = useMapGetter('getCurrentUser');
const watchersUiFlas = useMapGetter('conversationWatchers/getUIFlags');

const selectedWatchers = ref([]);
const search = ref('');
const open = ref(false);

const watchersFromStore = computed(() =>
  store.getters['conversationWatchers/getByConversationId'](
    props.conversationId
  )
);

const filteredAgents = computed(() =>
  agentsList.value.filter(a =>
    a.name.toLowerCase().includes(search.value.toLowerCase())
  )
);

const isSelected = agent => selectedWatchers.value.some(w => w.id === agent.id);

const isUserWatching = computed(() =>
  selectedWatchers.value.some(w => w.id === currentUser.value.id)
);

const thumbnailList = computed(() => selectedWatchers.value.slice(0, 4));

const moreAgentCount = computed(() => selectedWatchers.value.length - 4);

const moreThumbnailsText = computed(() =>
  moreAgentCount.value > 1
    ? t('CONVERSATION_PARTICIPANTS.REMANING_PARTICIPANTS_TEXT', {
        count: moreAgentCount.value,
      })
    : t('CONVERSATION_PARTICIPANTS.REMANING_PARTICIPANT_TEXT', { count: 1 })
);

const totalWatchersText = computed(() =>
  selectedWatchers.value.length > 1
    ? t('CONVERSATION_PARTICIPANTS.TOTAL_PARTICIPANTS_TEXT', {
        count: selectedWatchers.value.length,
      })
    : t('CONVERSATION_PARTICIPANTS.TOTAL_PARTICIPANT_TEXT', { count: 1 })
);

const fetchParticipants = () => {
  store.dispatch('conversationWatchers/show', {
    conversationId: props.conversationId,
  });
};

const updateParticipant = async userIds => {
  let alertMessage = t('CONVERSATION_PARTICIPANTS.API.SUCCESS_MESSAGE');
  try {
    await store.dispatch('conversationWatchers/update', {
      conversationId: props.conversationId,
      userIds,
    });
  } catch (error) {
    alertMessage =
      error?.message || t('CONVERSATION_PARTICIPANTS.API.ERROR_MESSAGE');
  } finally {
    useAlert(alertMessage);
  }
  fetchParticipants();
};

const toggleAgent = agent => {
  const isActive = isSelected(agent);
  const updated = isActive
    ? selectedWatchers.value.filter(w => w.id !== agent.id)
    : [...selectedWatchers.value, agent];
  selectedWatchers.value = updated;
  updateParticipant(updated.map(w => w.id));
};

const onSelfAssign = () => {
  selectedWatchers.value = [...selectedWatchers.value, currentUser.value];
  updateParticipant(selectedWatchers.value.map(w => w.id));
};

watch(
  () => props.conversationId,
  () => fetchParticipants()
);

watch(watchersFromStore, (participants = []) => {
  selectedWatchers.value = [...participants];
});

onMounted(() => {
  fetchParticipants();
  store.dispatch('agents/get');
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div>
        <p v-if="selectedWatchers.length" class="m-0 text-sm">
          <Spinner v-if="watchersUiFlas.isFetching" size="tiny" />
          {{ totalWatchersText }}
        </p>
        <p v-else class="text-sm text-muted-foreground">
          {{ $t('CONVERSATION_PARTICIPANTS.NO_PARTICIPANTS_TEXT') }}
        </p>
      </div>

      <Popover :open="open" @update:open="open = $event">
        <PopoverTrigger as-child>
          <Button
            v-tooltip.left="$t('CONVERSATION_PARTICIPANTS.ADD_PARTICIPANTS')"
            variant="outline"
            size="icon"
          >
            <Icon icon="i-lucide-settings" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end">
          <Input
            v-model="search"
            type="text"
            :placeholder="$t('CONVERSATION_PARTICIPANTS.SEARCH_AGENTS')"
            class="mb-2"
            autofocus
          />
          <div class="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
            <p
              v-if="filteredAgents.length === 0"
              class="text-sm text-center text-muted-foreground py-2"
            >
              {{ $t('CONVERSATION_PARTICIPANTS.NO_AGENTS_FOUND') }}
            </p>
            <Button
              v-for="agent in filteredAgents"
              :key="agent.id"
              variant="ghost"
              class="w-full justify-between px-2"
              @click="toggleAgent(agent)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Avatar
                  :src="agent.thumbnail"
                  :name="agent.name"
                  :status="agent.availability_status"
                  :size="24"
                  hide-offline-status
                  rounded-full
                />
                <span class="text-sm truncate">{{ agent.name }}</span>
              </div>
              <Icon
                v-if="isSelected(agent)"
                icon="i-lucide-check"
                class="size-3.5 shrink-0 text-n-blue-text"
              />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <div class="flex items-center justify-between p-2">
      <ThumbnailGroup
        :more-thumbnails-text="moreThumbnailsText"
        :show-more-thumbnails-count="moreAgentCount > 0"
        :users-list="thumbnailList"
      />
      <p v-if="isUserWatching" class="m-0 text-sm text-n-slate-10">
        {{ $t('CONVERSATION_PARTICIPANTS.YOU_ARE_WATCHING') }}
      </p>
      <Button v-else variant="link" @click="onSelfAssign">
        {{ $t('CONVERSATION_PARTICIPANTS.WATCH_CONVERSATION') }}
        <Icon icon="i-lucide-arrow-right" />
      </Button>
    </div>
  </div>
</template>
