<script>
import { mapGetters } from 'vuex';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { useAlert } from 'dashboard/composables';
import { copyTextToClipboard } from 'shared/helpers/clipboard';
import {
  getSortedAgentsByAvailability,
  getAgentsByUpdatedPresence,
} from 'dashboard/helper/agentHelper.js';
import { picoSearch } from '@chatwoot/pico-search';
import wootConstants from 'dashboard/constants/globals';
import AgentLoadingPlaceholder from './agentLoadingPlaceholder.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from 'dashboard/components-next/ui/context-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';

const MENU = {
  MARK_AS_READ: 'mark-as-read',
  MARK_AS_UNREAD: 'mark-as-unread',
  PRIORITY: 'priority',
  STATUS: 'status',
  SNOOZE: 'snooze',
  AGENT: 'agent',
  TEAM: 'team',
  LABEL: 'label',
  DELETE: 'delete',
  OPEN_NEW_TAB: 'open-new-tab',
  COPY_LINK: 'copy-link',
};

export default {
  components: {
    AgentLoadingPlaceholder,
    Icon,
    Avatar,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubTrigger,
    ContextMenuSubContent,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
  },
  props: {
    chatId: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      default: '',
    },
    hasUnreadMessages: {
      type: Boolean,
      default: false,
    },
    inboxId: {
      type: Number,
      default: null,
    },
    priority: {
      type: String,
      default: null,
    },
    conversationLabels: {
      type: Array,
      default: () => [],
    },
    conversationUrl: {
      type: String,
      default: '',
    },
    allowedOptions: {
      type: Array,
      default: () => [],
    },
  },
  emits: [
    'updateConversation',
    'assignPriority',
    'markAsUnread',
    'markAsRead',
    'assignAgent',
    'assignTeam',
    'assignLabel',
    'removeLabel',
    'deleteConversation',
    'close',
  ],
  setup() {
    const { isAdmin } = useAdmin();
    return {
      isAdmin,
    };
  },
  data() {
    return {
      MENU,
      labelSearchQuery: '',
      STATUS_TYPE: wootConstants.STATUS_TYPE,
      statusIcons: {
        [wootConstants.STATUS_TYPE.RESOLVED]: 'i-lucide-check',
        [wootConstants.STATUS_TYPE.OPEN]: 'i-lucide-rotate-ccw',
        [wootConstants.STATUS_TYPE.PENDING]: 'i-lucide-clock',
      },
      readOption: {
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.MARK_AS_READ'),
        icon: 'mail',
      },
      unreadOption: {
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.MARK_AS_UNREAD'),
        icon: 'mail-unread',
      },
      statusMenuConfig: [
        {
          key: wootConstants.STATUS_TYPE.RESOLVED,
          label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.RESOLVED'),
          icon: 'checkmark',
        },
        {
          key: wootConstants.STATUS_TYPE.OPEN,
          label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.REOPEN'),
          icon: 'arrow-redo',
        },
        {
          key: wootConstants.STATUS_TYPE.PENDING,
          label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.PENDING'),
          icon: 'book-clock',
        },
      ],
      snoozeOption: {
        key: wootConstants.STATUS_TYPE.SNOOZED,
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.SNOOZE.TITLE'),
        icon: 'snooze',
      },
      priorityConfig: {
        key: MENU.PRIORITY,
        label: this.$t('CONVERSATION.PRIORITY.TITLE'),
        icon: 'warning',
        options: [
          {
            label: this.$t('CONVERSATION.PRIORITY.OPTIONS.NONE'),
            key: null,
          },
          {
            label: this.$t('CONVERSATION.PRIORITY.OPTIONS.URGENT'),
            key: 'urgent',
          },
          {
            label: this.$t('CONVERSATION.PRIORITY.OPTIONS.HIGH'),
            key: 'high',
          },
          {
            label: this.$t('CONVERSATION.PRIORITY.OPTIONS.MEDIUM'),
            key: 'medium',
          },
          {
            label: this.$t('CONVERSATION.PRIORITY.OPTIONS.LOW'),
            key: 'low',
          },
        ].filter(item => item.key !== this.priority),
      },
      labelMenuConfig: {
        key: MENU.LABEL,
        icon: 'tag',
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.ASSIGN_LABEL'),
      },
      agentMenuConfig: {
        key: MENU.AGENT,
        icon: 'person-add',
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.ASSIGN_AGENT'),
      },
      teamMenuConfig: {
        key: MENU.TEAM,
        icon: 'people-team-add',
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.ASSIGN_TEAM'),
      },
      deleteOption: {
        key: MENU.DELETE,
        icon: 'delete',
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.DELETE'),
      },
      openInNewTabOption: {
        key: MENU.OPEN_NEW_TAB,
        icon: 'open',
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.OPEN_IN_NEW_TAB'),
      },
      copyLinkOption: {
        key: MENU.COPY_LINK,
        icon: 'copy',
        label: this.$t('CONVERSATION.CARD_CONTEXT_MENU.COPY_LINK'),
      },
    };
  },
  computed: {
    ...mapGetters({
      labels: 'labels/getLabels',
      teams: 'teams/getTeams',
      assignableAgentsUiFlags: 'inboxAssignableAgents/getUIFlags',
      currentUser: 'getCurrentUser',
      currentAccountId: 'getCurrentAccountId',
    }),
    filteredAgentOnAvailability() {
      const agents = this.$store.getters[
        'inboxAssignableAgents/getAssignableAgents'
      ](this.inboxId);
      const agentsByUpdatedPresence = getAgentsByUpdatedPresence(
        agents,
        this.currentUser,
        this.currentAccountId
      );
      const filteredAgents = getSortedAgentsByAvailability(
        agentsByUpdatedPresence
      );
      return filteredAgents;
    },
    assignableAgents() {
      return [
        {
          confirmed: true,
          name: 'None',
          id: null,
          role: 'agent',
          account_id: 0,
          email: 'None',
        },
        ...this.filteredAgentOnAvailability,
      ];
    },
    showSnooze() {
      // Don't show snooze if the conversation is already snoozed/resolved/pending
      return this.status === wootConstants.STATUS_TYPE.OPEN;
    },
    filteredLabels() {
      const labels = this.labelSearchQuery
        ? picoSearch(this.labels, this.labelSearchQuery, ['title'])
        : this.labels;
      // Assigned labels first, keeping each group's existing order.
      const isAssigned = label => this.conversationLabels.includes(label.title);
      return [...labels].sort((a, b) => isAssigned(b) - isAssigned(a));
    },
  },
  mounted() {
    this.$store.dispatch('inboxAssignableAgents/fetch', [this.inboxId]);
  },
  methods: {
    isAllowed(keys) {
      if (!this.allowedOptions.length) return true;
      return keys.some(key => this.allowedOptions.includes(key));
    },
    toggleStatus(status, snoozedUntil) {
      this.$emit('updateConversation', status, snoozedUntil);
    },
    async snoozeConversation() {
      await this.$store.dispatch('setContextMenuChatId', this.chatId);
      const ninja = document.querySelector('ninja-keys');
      ninja.open({ parent: 'snooze_conversation' });
    },
    assignPriority(priority) {
      this.$emit('assignPriority', priority);
    },
    deleteConversation() {
      this.$emit('deleteConversation', this.chatId);
    },
    openInNewTab() {
      if (!this.conversationUrl) return;

      const url = `${window.chatwootConfig.hostURL}${this.conversationUrl}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      this.$emit('close');
    },
    async copyConversationLink() {
      if (!this.conversationUrl) return;
      try {
        const url = `${window.chatwootConfig.hostURL}${this.conversationUrl}`;
        await copyTextToClipboard(url);
        useAlert(this.$t('CONVERSATION.CARD_CONTEXT_MENU.COPY_LINK_SUCCESS'));
        this.$emit('close');
      } catch (error) {
        // error
      }
    },
    show(key) {
      // If the conversation status is same as the action, then don't display the option
      // i.e.: Don't show an option to resolve if the conversation is already resolved.
      return this.status !== key;
    },
  },
};
</script>

<template>
  <ContextMenuItem
    v-if="
      isAllowed([MENU.MARK_AS_READ, MENU.MARK_AS_UNREAD]) && !hasUnreadMessages
    "
    class="gap-2"
    @select="$emit('markAsUnread')"
  >
    <Icon icon="i-lucide-mail" />
    {{ unreadOption.label }}
  </ContextMenuItem>
  <ContextMenuItem
    v-else-if="isAllowed([MENU.MARK_AS_READ, MENU.MARK_AS_UNREAD])"
    class="gap-2"
    @select="$emit('markAsRead')"
  >
    <Icon icon="i-lucide-mail-open" />
    {{ readOption.label }}
  </ContextMenuItem>
  <ContextMenuSeparator
    v-if="isAllowed([MENU.MARK_AS_READ, MENU.MARK_AS_UNREAD])"
  />

  <template v-if="isAllowed([MENU.STATUS, MENU.SNOOZE])">
    <template v-for="option in statusMenuConfig" :key="option.key">
      <ContextMenuItem
        v-if="show(option.key) && isAllowed([MENU.STATUS])"
        class="gap-2"
        @select="toggleStatus(option.key, null)"
      >
        <Icon :icon="statusIcons[option.key]" />
        {{ option.label }}
      </ContextMenuItem>
    </template>
    <ContextMenuItem
      v-if="showSnooze && isAllowed([MENU.SNOOZE])"
      class="gap-2"
      @select="snoozeConversation()"
    >
      <Icon icon="i-lucide-alarm-clock" />
      {{ snoozeOption.label }}
    </ContextMenuItem>
    <ContextMenuSeparator />
  </template>

  <template
    v-if="isAllowed([MENU.PRIORITY, MENU.LABEL, MENU.AGENT, MENU.TEAM])"
  >
    <ContextMenuSub v-if="isAllowed([MENU.PRIORITY])">
      <ContextMenuSubTrigger class="gap-2">
        <Icon icon="i-lucide-signal" />
        {{ priorityConfig.label }}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuItem
          v-for="(option, i) in priorityConfig.options"
          :key="i"
          @select="assignPriority(option.key)"
        >
          {{ option.label }}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuSub v-if="isAllowed([MENU.LABEL]) && labels.length">
      <ContextMenuSubTrigger class="gap-2">
        <Icon icon="i-lucide-tag" />
        {{ labelMenuConfig.label }}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent class="w-[12.5rem]">
        <InputGroup class="h-8 mb-1">
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            v-model="labelSearchQuery"
            type="search"
            class="text-xs"
            :placeholder="$t('CONVERSATION.CARD_CONTEXT_MENU.SEARCH_LABELS')"
            @keydown.stop
          />
        </InputGroup>
        <div class="max-h-[12.5rem] overflow-x-hidden overflow-y-auto">
          <ContextMenuItem
            v-for="label in filteredLabels"
            :key="label.id"
            class="gap-2"
            @select.prevent="
              conversationLabels.includes(label.title)
                ? $emit('removeLabel', label)
                : $emit('assignLabel', label)
            "
          >
            <span
              class="flex-shrink-0 rounded-full size-2.5"
              :style="{ backgroundColor: label.color }"
            />
            <span class="flex-1 min-w-0 truncate">{{ label.title }}</span>
            <Icon
              v-if="conversationLabels.includes(label.title)"
              icon="i-lucide-check"
              class="flex-shrink-0 size-3.5"
            />
          </ContextMenuItem>
          <p
            v-if="!filteredLabels.length"
            class="px-2 py-2 m-0 text-xs text-center text-n-slate-11"
          >
            {{ $t('CONVERSATION.CARD_CONTEXT_MENU.NO_LABELS_FOUND') }}
          </p>
        </div>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuSub v-if="isAllowed([MENU.AGENT])">
      <ContextMenuSubTrigger class="gap-2">
        <Icon icon="i-lucide-user-plus" />
        {{ agentMenuConfig.label }}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent class="max-h-80 overflow-y-auto">
        <AgentLoadingPlaceholder v-if="assignableAgentsUiFlags.isFetching" />
        <template v-else>
          <ContextMenuItem
            v-for="agent in assignableAgents"
            :key="agent.id"
            class="gap-2"
            @select="$emit('assignAgent', agent)"
          >
            <Avatar
              :name="agent.name"
              :src="agent.thumbnail"
              :size="20"
              rounded-full
            />
            {{ agent.name }}
          </ContextMenuItem>
        </template>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuSub v-if="isAllowed([MENU.TEAM]) && teams.length">
      <ContextMenuSubTrigger class="gap-2">
        <Icon icon="i-lucide-users" />
        {{ teamMenuConfig.label }}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuItem
          v-for="team in teams"
          :key="team.id"
          @select="$emit('assignTeam', team)"
        >
          {{ team.name }}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuSeparator />
  </template>

  <ContextMenuItem
    v-if="isAllowed([MENU.OPEN_NEW_TAB])"
    class="gap-2"
    @select="openInNewTab"
  >
    <Icon icon="i-lucide-external-link" />
    {{ openInNewTabOption.label }}
  </ContextMenuItem>
  <ContextMenuItem
    v-if="isAllowed([MENU.COPY_LINK])"
    class="gap-2"
    @select="copyConversationLink"
  >
    <Icon icon="i-lucide-link" />
    {{ copyLinkOption.label }}
  </ContextMenuItem>

  <template v-if="isAdmin && isAllowed([MENU.DELETE])">
    <ContextMenuSeparator />
    <ContextMenuItem
      class="gap-2 text-destructive"
      @select="deleteConversation"
    >
      <Icon icon="i-lucide-trash-2" />
      {{ deleteOption.label }}
    </ContextMenuItem>
  </template>
</template>
