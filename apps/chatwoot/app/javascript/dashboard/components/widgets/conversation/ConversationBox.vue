<script>
import { mapGetters } from 'vuex';
import ConversationHeader from './ConversationHeader.vue';
import DashboardAppFrame from '../DashboardApp/Frame.vue';
import EmptyState from './EmptyState/EmptyState.vue';
import MessagesView from './MessagesView.vue';
import { Tabs, TabsList, TabsTrigger } from 'dashboard/components-next/ui/tabs';

export default {
  components: {
    ConversationHeader,
    DashboardAppFrame,
    EmptyState,
    MessagesView,
    Tabs,
    TabsList,
    TabsTrigger,
  },
  props: {
    inboxId: {
      type: [Number, String],
      default: '',
      required: false,
    },
    isInboxView: {
      type: Boolean,
      default: false,
    },
    isContactDialogOpen: {
      type: Boolean,
      default: true,
    },
    isOnExpandedLayout: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return { activeIndex: 0 };
  },
  computed: {
    ...mapGetters({
      currentChat: 'getSelectedChat',
      dashboardApps: 'dashboardApps/getRecords',
    }),
    dashboardAppTabs() {
      return [
        {
          key: 'messages',
          index: 0,
          name: this.$t('CONVERSATION.DASHBOARD_APP_TAB_MESSAGES'),
        },
        ...this.dashboardApps.map((dashboardApp, index) => ({
          key: `dashboard-${dashboardApp.id}`,
          index: index + 1,
          name: dashboardApp.title,
        })),
      ];
    },
    showContactDialog() {
      return this.isContactDialogOpen && this.currentChat.id;
    },
  },
  watch: {
    'currentChat.inbox_id': {
      immediate: true,
      handler() {
        if (this.currentChat.inbox_id && this.currentChat.id) {
          this.$store.dispatch('inboxAssignableAgents/fetch', {
            inboxIds: [this.currentChat.inbox_id],
            includeAIAssignees: true,
          });
        }
      },
    },
    'currentChat.id'() {
      this.fetchLabels();
      this.activeIndex = 0;
    },
  },
  mounted() {
    this.fetchLabels();
    this.$store.dispatch('dashboardApps/get');
  },
  methods: {
    fetchLabels() {
      if (!this.currentChat.id) {
        return;
      }
      this.$store.dispatch('conversationLabels/get', this.currentChat.id);
    },
    onDashboardAppTabChange(index) {
      this.activeIndex = index;
    },
  },
};
</script>

<template>
  <div
    class="conversation-details-wrap flex flex-col min-w-0 w-full bg-n-surface-1 relative"
    :class="{
      'border-l rtl:border-l-0 rtl:border-r border-n-weak': !isOnExpandedLayout,
    }"
  >
    <ConversationHeader
      v-if="currentChat.id"
      :chat="currentChat"
      :show-back-button="isOnExpandedLayout && !isInboxView"
      :class="{
        'border-b border-b-n-weak !pt-2': !dashboardApps.length,
      }"
    />
    <div>
      <Tabs
        v-if="dashboardApps.length && currentChat.id"
        :model-value="String(activeIndex)"
        @update:model-value="val => onDashboardAppTabChange(Number(val))"
      >
        <TabsList>
          <TabsTrigger
            v-for="tab in dashboardAppTabs"
            :key="tab.key"
            :value="String(tab.index)"
          >
            {{ tab.name }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
    <div v-show="!activeIndex" class="flex h-full min-h-0 m-0">
      <MessagesView
        v-if="currentChat.id"
        :inbox-id="inboxId"
        :is-inbox-view="isInboxView"
      />
      <EmptyState
        v-if="!currentChat.id && !isInboxView"
        :is-on-expanded-layout="isOnExpandedLayout"
      />
      <slot />
    </div>
    <DashboardAppFrame
      v-for="(dashboardApp, index) in dashboardApps"
      v-show="activeIndex - 1 === index"
      :key="currentChat.id + '-' + dashboardApp.id"
      :is-visible="activeIndex - 1 === index"
      :config="dashboardApps[index].content"
      :position="index"
      :current-chat="currentChat"
    />
  </div>
</template>
