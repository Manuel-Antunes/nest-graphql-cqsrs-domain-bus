<script>
import { mapGetters } from 'vuex';
import { getUnixTime } from 'date-fns';
import { findSnoozeTime } from 'dashboard/helper/snoozeHelpers';
import { emitter } from 'shared/helpers/mitt';
import wootConstants from 'dashboard/constants/globals';
import {
  CMD_BULK_ACTION_SNOOZE_CONVERSATION,
  CMD_BULK_ACTION_REOPEN_CONVERSATION,
  CMD_BULK_ACTION_RESOLVE_CONVERSATION,
} from 'dashboard/helper/commandbar/events';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from 'dashboard/components-next/ui/command';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'dashboard/components-next/ui/dropdown-menu';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import { Card, CardContent } from 'dashboard/components-next/ui/card';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import LabelActions from './LabelActions.vue';
import CustomSnoozeModal from 'dashboard/components/CustomSnoozeModal.vue';

export default {
  components: {
    LabelActions,
    CustomSnoozeModal,
    Button,
    Icon,
    Card,
    CardContent,
    Checkbox,
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    Popover,
    PopoverTrigger,
    PopoverContent,
  },
  props: {
    conversations: {
      type: Array,
      default: () => [],
    },
    allConversationsSelected: {
      type: Boolean,
      default: false,
    },
    selectedInboxes: {
      type: Array,
      default: () => [],
    },
    showOpenAction: {
      type: Boolean,
      default: false,
    },
    showResolvedAction: {
      type: Boolean,
      default: false,
    },
    showSnoozedAction: {
      type: Boolean,
      default: false,
    },
  },
  emits: [
    'selectAllConversations',
    'assignAgent',
    'updateConversations',
    'assignLabels',
    'assignTeam',
    'resolveConversations',
  ],
  data() {
    return {
      showLabelActions: false,
      showAgentsList: false,
      showTeamsList: false,
      showCustomTimeSnoozeModal: false,
    };
  },
  computed: {
    ...mapGetters({
      teams: 'teams/getTeams',
    }),
    assignableAgents() {
      return this.$store.getters['inboxAssignableAgents/getAssignableAgents'](
        this.selectedInboxes.join(',')
      );
    },
    agentOptions() {
      return [{ id: null, name: 'None' }, ...this.assignableAgents];
    },
    teamOptions() {
      return [
        { id: 0, name: this.$t('BULK_ACTION.TEAMS.NONE') },
        ...this.teams,
      ];
    },
  },
  watch: {
    selectedInboxes(inboxes) {
      this.$store.dispatch('inboxAssignableAgents/fetch', inboxes);
    },
  },
  mounted() {
    this.$store.dispatch('inboxAssignableAgents/fetch', this.selectedInboxes);
    emitter.on(
      CMD_BULK_ACTION_SNOOZE_CONVERSATION,
      this.onCmdSnoozeConversation
    );
    emitter.on(
      CMD_BULK_ACTION_REOPEN_CONVERSATION,
      this.onCmdReopenConversation
    );
    emitter.on(
      CMD_BULK_ACTION_RESOLVE_CONVERSATION,
      this.onCmdResolveConversation
    );
  },
  unmounted() {
    emitter.off(
      CMD_BULK_ACTION_SNOOZE_CONVERSATION,
      this.onCmdSnoozeConversation
    );
    emitter.off(
      CMD_BULK_ACTION_REOPEN_CONVERSATION,
      this.onCmdReopenConversation
    );
    emitter.off(
      CMD_BULK_ACTION_RESOLVE_CONVERSATION,
      this.onCmdResolveConversation
    );
  },
  methods: {
    onCmdSnoozeConversation(snoozeType) {
      if (snoozeType === wootConstants.SNOOZE_OPTIONS.UNTIL_CUSTOM_TIME) {
        this.showCustomTimeSnoozeModal = true;
      } else {
        this.$emit(
          'updateConversations',
          'snoozed',
          findSnoozeTime(snoozeType) || null
        );
      }
    },
    onCmdReopenConversation() {
      this.$emit('updateConversations', 'open', null);
    },
    onCmdResolveConversation() {
      this.$emit('updateConversations', 'resolved', null);
    },
    customSnoozeTime(customSnoozedTime) {
      this.showCustomTimeSnoozeModal = false;
      if (customSnoozedTime) {
        this.$emit(
          'updateConversations',
          'snoozed',
          getUnixTime(customSnoozedTime)
        );
      }
    },
    hideCustomSnoozeModal() {
      this.showCustomTimeSnoozeModal = false;
    },
    selectAll(checked) {
      this.$emit('selectAllConversations', checked);
    },
    triggerSnooze() {
      const ninja = document.querySelector('ninja-keys');
      ninja?.open({ parent: 'bulk_action_snooze_conversation' });
    },
    onAgentSelect(agent) {
      this.$emit('assignAgent', agent);
      this.showAgentsList = false;
    },
    onTeamSelect(team) {
      this.$emit('assignTeam', team);
      this.showTeamsList = false;
    },
    assignLabels(labels) {
      this.$emit('assignLabels', labels);
      this.showLabelActions = false;
    },
  },
};
</script>

<template>
  <div class="border-b flex flex-col gap-2 p-3">
    <div class="flex items-center justify-between gap-2">
      <label class="flex items-center justify-between bulk-action__panel">
        <Checkbox
          :checked="allConversationsSelected ? true : 'indeterminate'"
          @update:checked="selectAll"
        >
          <span
            :class="
              allConversationsSelected ? 'i-lucide-check' : 'i-lucide-minus'
            "
            class="size-3.5"
          />
        </Checkbox>
        <span>
          {{
            $t('BULK_ACTION.CONVERSATIONS_SELECTED', {
              conversationCount: conversations.length,
            })
          }}
        </span>
      </label>

      <div class="flex items-center gap-1 bulk-action__actions">
        <!-- Labels -->
        <Popover v-model:open="showLabelActions">
          <PopoverTrigger as-child>
            <Button
              v-tooltip="$t('BULK_ACTION.LABELS.ASSIGN_LABELS')"
              variant="outline"
              size="icon"
            >
              <Icon icon="i-lucide-tags" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-60">
            <LabelActions @assign="assignLabels" />
          </PopoverContent>
        </Popover>

        <!-- Status update -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              v-tooltip="$t('BULK_ACTION.UPDATE.CHANGE_STATUS')"
              variant="outline"
              size="icon"
            >
              <Icon icon="i-lucide-repeat" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              v-if="!showResolvedAction"
              @click="$emit('updateConversations', 'resolved', null)"
            >
              <Icon icon="i-lucide-check" />
              {{ $t('CONVERSATION.HEADER.RESOLVE_ACTION') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="!showOpenAction"
              @click="$emit('updateConversations', 'open', null)"
            >
              <Icon icon="i-lucide-redo" />
              {{ $t('CONVERSATION.HEADER.REOPEN_ACTION') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!showSnoozedAction" @click="triggerSnooze">
              <Icon icon="i-lucide-alarm-clock" />
              {{ $t('BULK_ACTION.UPDATE.SNOOZE_UNTIL') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- Agent assign -->
        <Popover v-model:open="showAgentsList">
          <PopoverTrigger as-child>
            <Button
              v-tooltip="$t('BULK_ACTION.ASSIGN_AGENT_TOOLTIP')"
              variant="outline"
              size="icon"
            >
              <Icon icon="i-lucide-user-round-plus" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-56 p-0">
            <Command>
              <CommandInput
                :placeholder="$t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
              />
              <CommandList>
                <CommandEmpty>
                  {{ $t('BULK_ACTION.AGENT_LIST_LOADING') }}
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="agent in agentOptions"
                    :key="String(agent.id)"
                    :value="agent.name"
                    @select="onAgentSelect(agent)"
                  >
                    {{ agent.name }}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <!-- Team assign -->
        <Popover v-model:open="showTeamsList">
          <PopoverTrigger as-child>
            <Button
              v-tooltip="$t('BULK_ACTION.ASSIGN_TEAM_TOOLTIP')"
              variant="outline"
              size="icon"
            >
              <Icon icon="i-lucide-users-round" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-56 p-0">
            <Command>
              <CommandInput
                :placeholder="$t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
              />
              <CommandList>
                <CommandEmpty>
                  {{ $t('BULK_ACTION.TEAMS.NO_TEAMS_AVAILABLE') }}
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="team in teamOptions"
                    :key="String(team.id)"
                    :value="team.name"
                    @select="onTeamSelect(team)"
                  >
                    {{ team.name }}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <Card
      class="bg-n-amber-3 text-amber-950 py-3 text-xs shadow-amber-200 border-amber-100"
    >
      <CardContent v-if="allConversationsSelected">
        {{ $t('BULK_ACTION.ALL_CONVERSATIONS_SELECTED_ALERT') }}
      </CardContent>
    </Card>

    <CustomSnoozeModal
      :open="showCustomTimeSnoozeModal"
      @close="hideCustomSnoozeModal"
      @choose-time="customSnoozeTime"
    />
  </div>
</template>

<style scoped lang="scss">
.bulk-action__panel {
  @apply cursor-pointer;

  span {
    @apply text-xs my-0 mx-1;
  }
}
</style>
