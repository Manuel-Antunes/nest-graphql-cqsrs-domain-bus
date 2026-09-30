<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { provideSidebarContext } from './provider';
import { useAccount } from 'dashboard/composables/useAccount';
import { useConfig } from 'dashboard/composables/useConfig';
import { useMapGetter } from 'dashboard/composables/store';
import { useStore } from 'vuex';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import AppLink from 'dashboard/components-next/AppLink.vue';
import { useI18n } from 'vue-i18n';
import { useSidebarKeyboardShortcuts } from './useSidebarKeyboardShortcuts';
import { usePolicy } from 'dashboard/composables/usePolicy';
import {
  useSettingsMenu,
  isSettingsPath,
  SETTINGS_ENTRY_ROUTE,
} from './settingsMenu';
import { vOnClickOutside } from '@vueuse/components';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';
import { getInboxIdentifier } from 'dashboard/helper/inbox';
import {
  SIDEBAR_SORT_SECTIONS,
  getSidebarSortOptions,
  resolveSidebarSort,
  sortSidebarItems,
} from 'dashboard/helper/sidebarSort';

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from 'next/ui/navigation-menu';
import Icon from 'next/icon/Icon.vue';
import ChannelIcon from 'dashboard/components-next/icon/ChannelIcon.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
import SidebarSortMenu from './SidebarSortMenu.vue';

const props = defineProps({
  isMobileSidebarOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'closeKeyShortcutModal',
  'openKeyShortcutModal',
  'showCreateAccountModal',
  'closeMobileSidebar',
]);

const { accountId, accountScopedRoute, isOnChatwootCloud } = useAccount();
const { isEnterprise } = useConfig();
const store = useStore();
// Dual-mode navigation (vue-router on the SPA, Inertia + registry under Inertia).
const { resolveMeta, visit, currentRouteName, currentPath } =
  useAppNavigation();
const { t } = useI18n();

// Calls run on the enterprise-only API (cloud runs enterprise); hide the entry
// on community so it doesn't lead to a dashboard/CTA the backend can't serve.
const isCallsAvailable = computed(
  () => isOnChatwootCloud.value || isEnterprise
);

const currentUserId = useMapGetter('getCurrentUserID');
const isFeatureEnabledonAccount = useMapGetter(
  'accounts/isFeatureEnabledonAccount'
);

const hasConversationUnreadCounts = computed(() =>
  isFeatureEnabledonAccount.value(
    accountId.value,
    FEATURE_FLAGS.CONVERSATION_UNREAD_COUNTS
  )
);

const hasFilteredUnreadCounts = computed(
  () =>
    hasConversationUnreadCounts.value &&
    isFeatureEnabledonAccount.value(
      accountId.value,
      FEATURE_FLAGS.UNREAD_COUNT_FOR_FILTERS
    )
);

// Clicking a rail icon navigates to that section's default destination
// (Conversations -> all conversations, Contacts -> all contacts, …) while
// hover still opens the flyout.
const goToSection = item => {
  const destination = item.to ?? item.children?.find(child => child.to)?.to;
  if (destination) visit(destination);
};

const toggleShortcutModalFn = show => {
  if (show) {
    emit('openKeyShortcutModal');
  } else {
    emit('closeKeyShortcutModal');
  }
};

useSidebarKeyboardShortcuts(toggleShortcutModalFn);

const expandedItem = ref(null);
const setExpandedItem = name => {
  expandedItem.value = expandedItem.value === name ? null : name;
};
provideSidebarContext({ expandedItem, setExpandedItem });

const inboxes = useMapGetter('inboxes/getInboxes');
const unreadNotificationCount = useMapGetter('notifications/getUnreadCount');
const labels = useMapGetter('labels/getLabelsOnSidebar');

// Per-inbox / per-team / total unread conversation counts (loaded list) for the
// sidebar badges — same indicators we had before, WhatsApp-style.
const totalUnreadConversations = useMapGetter(
  'conversations/getUnreadConversationCount'
);
const unreadCountByInbox = useMapGetter('conversations/getUnreadCountByInbox');
const unreadCountByTeam = useMapGetter('conversations/getUnreadCountByTeam');
const allUnreadCount = useMapGetter(
  'conversationUnreadCounts/getAllUnreadCount'
);
const getInboxUnreadCount = useMapGetter(
  'conversationUnreadCounts/getInboxUnreadCount'
);
const getLabelUnreadCount = useMapGetter(
  'conversationUnreadCounts/getLabelUnreadCount'
);
const getTeamUnreadCount = useMapGetter(
  'conversationUnreadCounts/getTeamUnreadCount'
);
const getFolderUnreadCount = useMapGetter(
  'conversationUnreadCounts/getFolderUnreadCount'
);
const mentionsUnreadCount = useMapGetter(
  'conversationUnreadCounts/getMentionsUnreadCount'
);
const participatingUnreadCount = useMapGetter(
  'conversationUnreadCounts/getParticipatingUnreadCount'
);
const unattendedUnreadCount = useMapGetter(
  'conversationUnreadCounts/getUnattendedUnreadCount'
);

// Null-safe accessors: never let a missing/undefined getter throw inside the
// menuItems computed (which would wipe the whole rail + flyouts).
const inboxUnread = id => {
  if (hasConversationUnreadCounts.value) return getInboxUnreadCount.value(id);
  return typeof unreadCountByInbox.value === 'function'
    ? unreadCountByInbox.value(id)
    : 0;
};
const teamUnread = id => {
  if (hasConversationUnreadCounts.value) return getTeamUnreadCount.value(id);
  return typeof unreadCountByTeam.value === 'function'
    ? unreadCountByTeam.value(id)
    : 0;
};
const labelUnread = id =>
  hasConversationUnreadCounts.value ? getLabelUnreadCount.value(id) : 0;
const folderUnread = id =>
  hasFilteredUnreadCounts.value ? getFolderUnreadCount.value(id) : 0;
const filterUnread = count => (hasFilteredUnreadCounts.value ? count : 0);
const totalUnread = computed(() =>
  hasConversationUnreadCounts.value
    ? allUnreadCount.value
    : totalUnreadConversations.value
);

// Aggregate unread shown on each rail icon: notifications for Inbox, total
// unread conversations for Conversation, and total unread across inboxes for
// Inboxes. Per-team / per-inbox counts live on the flyout child items below.
const railUnreadCount = item => {
  if (item.name === 'Inbox') return unreadNotificationCount.value || 0;
  if (item.name === 'Conversation' || item.name === 'Inboxes') {
    return totalUnread.value || 0;
  }
  return 0;
};
const teams = useMapGetter('teams/getMyTeams');
const contactCustomViews = useMapGetter('customViews/getContactCustomViews');
const conversationCustomViews = useMapGetter(
  'customViews/getConversationCustomViews'
);
const getSidebarSectionSort = useMapGetter(
  'sidebarSortPreferences/getSectionSort'
);

onMounted(() => {
  store.dispatch('labels/get');
  store.dispatch('inboxes/get');
  store.dispatch('notifications/unReadCount');
  store.dispatch('teams/get');
  store.dispatch('attributes/get');
  store.dispatch('customViews/get', 'conversation');
  store.dispatch('customViews/get', 'contact');
});

watch(
  [accountId, hasConversationUnreadCounts],
  ([currentAccountId, isEnabled]) => {
    if (!currentAccountId) return;
    if (!isEnabled) {
      store.dispatch('conversationUnreadCounts/clear');
      return;
    }
    store.dispatch('conversationUnreadCounts/get');
  },
  { immediate: true }
);

watch(
  [accountId, currentUserId],
  ([currentAccountId, userId]) => {
    if (!currentAccountId || !userId) return;
    store.dispatch('sidebarSortPreferences/initialize');
  },
  { immediate: true }
);

const hasUnreadCountsForSection = section =>
  section === SIDEBAR_SORT_SECTIONS.FOLDERS
    ? hasFilteredUnreadCounts.value
    : hasConversationUnreadCounts.value;

const getSortForSection = section =>
  resolveSidebarSort(section, getSidebarSectionSort.value(section), {
    hasUnreadCounts: hasUnreadCountsForSection(section),
  });

const buildSortConfig = section => ({
  sortOptions: getSidebarSortOptions(section, {
    hasUnreadCounts: hasUnreadCountsForSection(section),
  }),
  activeSort: getSortForSection(section),
  onSortChange: sortBy =>
    store.dispatch('sidebarSortPreferences/setSectionSort', {
      section,
      sortBy,
    }),
});

const sortedFolders = computed(() =>
  sortSidebarItems(conversationCustomViews.value, {
    sortBy: getSortForSection(SIDEBAR_SORT_SECTIONS.FOLDERS),
    labelKey: view => view.name,
    unreadCountKey: view => folderUnread(view.id),
  })
);

const sortedTeams = computed(() =>
  sortSidebarItems(teams.value, {
    sortBy: getSortForSection(SIDEBAR_SORT_SECTIONS.TEAMS),
    labelKey: team => team.name,
    unreadCountKey: team => teamUnread(team.id),
  })
);

const sortedInboxes = computed(() =>
  sortSidebarItems(inboxes.value, {
    sortBy: getSortForSection(SIDEBAR_SORT_SECTIONS.CHANNELS),
    labelKey: inbox => inbox.name,
    unreadCountKey: inbox => inboxUnread(inbox.id),
  })
);

const sortedLabels = computed(() =>
  sortSidebarItems(labels.value, {
    sortBy: getSortForSection(SIDEBAR_SORT_SECTIONS.LABELS),
    labelKey: label => label.title,
    unreadCountKey: label => labelUnread(label.id),
  })
);

const closeMobileSidebar = () => {
  if (!props.isMobileSidebarOpen) return;
  emit('closeMobileSidebar');
};

const menuItems = computed(() => {
  return [
    {
      name: 'Inbox',
      label: t('SIDEBAR.INBOX'),
      icon: 'i-lucide-inbox',
      to: accountScopedRoute('inbox_view'),
      activeOn: ['inbox_view', 'inbox_view_conversation'],
    },
    {
      name: 'Conversation',
      label: t('SIDEBAR.CONVERSATIONS'),
      icon: 'i-lucide-message-circle',
      to: accountScopedRoute('home'),
      children: [
        {
          name: 'All',
          label: t('SIDEBAR.ALL_CONVERSATIONS'),
          count: totalUnread.value,
          activeOn: ['inbox_conversation'],
          to: accountScopedRoute('home'),
        },
        {
          name: 'Mentions',
          label: t('SIDEBAR.MENTIONED_CONVERSATIONS'),
          count: filterUnread(mentionsUnreadCount.value),
          activeOn: ['conversation_through_mentions'],
          to: accountScopedRoute('conversation_mentions'),
        },
        {
          name: 'Participating',
          label: t('SIDEBAR.PARTICIPATING_CONVERSATIONS'),
          count: filterUnread(participatingUnreadCount.value),
          activeOn: ['conversation_through_participating'],
          to: accountScopedRoute('conversation_participating'),
        },
        {
          name: 'Unattended',
          activeOn: ['conversation_through_unattended'],
          label: t('SIDEBAR.UNATTENDED_CONVERSATIONS'),
          count: filterUnread(unattendedUnreadCount.value),
          to: accountScopedRoute('conversation_unattended'),
        },
        {
          name: 'Folders',
          label: t('SIDEBAR.CUSTOM_VIEWS_FOLDER'),
          icon: 'i-lucide-folder',
          activeOn: ['conversations_through_folders'],
          ...buildSortConfig(SIDEBAR_SORT_SECTIONS.FOLDERS),
          children: sortedFolders.value.map(view => ({
            name: `${view.name}-${view.id}`,
            label: view.name,
            count: folderUnread(view.id),
            to: accountScopedRoute('folder_conversations', { id: view.id }),
          })),
        },
        {
          name: 'Teams',
          label: t('SIDEBAR.TEAMS'),
          icon: 'i-lucide-users',
          activeOn: ['conversations_through_team'],
          ...buildSortConfig(SIDEBAR_SORT_SECTIONS.TEAMS),
          children: sortedTeams.value.map(team => ({
            name: `${team.name}-${team.id}`,
            label: team.name,
            icon: 'i-lucide-users',
            emoji: team.icon,
            emojiColor: team.icon_color,
            count: teamUnread(team.id),
            to: accountScopedRoute('team_conversations', { teamId: team.id }),
          })),
        },
        {
          name: 'Labels',
          label: t('SIDEBAR.LABELS'),
          icon: 'i-lucide-tag',
          activeOn: ['conversations_through_label'],
          ...buildSortConfig(SIDEBAR_SORT_SECTIONS.LABELS),
          children: sortedLabels.value.map(label => ({
            name: `${label.title}-${label.id}`,
            label: label.title,
            swatch: label.color,
            count: labelUnread(label.id),
            to: accountScopedRoute('label_conversations', {
              label: label.title,
            }),
          })),
        },
      ],
    },
    {
      name: 'Inboxes',
      label: t('SIDEBAR.CHANNELS'),
      icon: 'i-lucide-mailbox',
      // Clicking opens the first inbox; hover lists all inboxes with their channel icons.
      to: sortedInboxes.value[0]
        ? accountScopedRoute('inbox_dashboard', {
            inbox_id: sortedInboxes.value[0].id,
          })
        : null,
      activeOn: ['conversation_through_inbox'],
      ...buildSortConfig(SIDEBAR_SORT_SECTIONS.CHANNELS),
      children: sortedInboxes.value.map(inbox => ({
        name: `${inbox.name}-${inbox.id}`,
        label: inbox.name,
        inbox,
        identifier: getInboxIdentifier(inbox),
        count: inboxUnread(inbox.id),
        to: accountScopedRoute('inbox_dashboard', { inbox_id: inbox.id }),
      })),
    },
    ...(isCallsAvailable.value
      ? [
          {
            name: 'Calls',
            label: t('SIDEBAR.CALLS'),
            icon: 'i-lucide-phone',
            to: accountScopedRoute('calls_dashboard_index'),
            activeOn: ['calls_dashboard_index'],
          },
        ]
      : []),
    // Divider in the rail is rendered before Contacts.
    {
      name: 'Contacts',
      label: t('SIDEBAR.CONTACTS'),
      icon: 'i-lucide-contact',
      to: accountScopedRoute(
        'contacts_dashboard_index',
        {},
        { page: 1, search: undefined }
      ),
      children: [
        {
          name: 'All Contacts',
          label: t('SIDEBAR.ALL_CONTACTS'),
          to: accountScopedRoute(
            'contacts_dashboard_index',
            {},
            { page: 1, search: undefined }
          ),
          activeOn: ['contacts_dashboard_index', 'contacts_edit'],
        },
        {
          name: 'Active',
          label: t('SIDEBAR.ACTIVE'),
          to: accountScopedRoute('contacts_dashboard_active'),
          activeOn: ['contacts_dashboard_active'],
        },
        {
          name: 'Segments',
          icon: 'i-lucide-group',
          label: t('SIDEBAR.CUSTOM_VIEWS_SEGMENTS'),
          children: contactCustomViews.value.map(view => ({
            name: `${view.name}-${view.id}`,
            label: view.name,
            to: accountScopedRoute(
              'contacts_dashboard_segments_index',
              { segmentId: view.id },
              { page: 1 }
            ),
            activeOn: [
              'contacts_dashboard_segments_index',
              'contacts_edit_segment',
            ],
          })),
        },
        {
          name: 'Tagged With',
          icon: 'i-lucide-tag',
          label: t('SIDEBAR.TAGGED_WITH'),
          children: labels.value.map(label => ({
            name: `${label.title}-${label.id}`,
            label: label.title,
            swatch: label.color,
            to: accountScopedRoute(
              'contacts_dashboard_labels_index',
              { label: label.title },
              { page: 1, search: undefined }
            ),
            activeOn: [
              'contacts_dashboard_labels_index',
              'contacts_edit_label',
            ],
          })),
        },
      ],
    },
    {
      name: 'Companies',
      label: t('SIDEBAR.COMPANIES'),
      icon: 'i-lucide-building-2',
      to: accountScopedRoute(
        'companies_dashboard_index',
        {},
        { page: 1, search: undefined }
      ),
      activeOn: ['companies_dashboard_index', 'companies_dashboard_show'],
    },
  ];
});

// --- WhatsApp-style icon rail -------------------------------------------
// The rail shows top-level sections as icons. Hovering an icon opens a
// shadcn/reka NavigationMenu flyout (to the right) with that section's filters.
// Settings is pinned to the bottom — it is a plain link into the settings section
// (SettingsLayout renders its sidebar there), not a panel this rail owns.
const sectionMatchesRoute = section => {
  const names = [];
  const collect = node => {
    if (node.activeOn) names.push(...node.activeOn);
    (node.children || []).forEach(collect);
  };
  collect(section);
  return names.includes(currentRouteName.value);
};

// --- Permissions / feature flags ----------------------------------------
// Mirror the old SidebarGroup <Policy> behaviour so the rail + flyouts only
// show what the current user may access (route meta.permissions /
// meta.featureFlag / meta.installationTypes). Dynamic, data-driven children
// (teams, labels, inboxes, segments, folders) carry no special gating.
const { shouldShow } = usePolicy();

const IDENTIFIER_SEPARATOR = '·';

const isAllowed = to => {
  if (!to) return true;
  const meta = resolveMeta(to);
  return shouldShow(
    meta.featureFlag || '',
    meta.permissions ?? [],
    meta.installationTypes ?? []
  );
};

const isSectionVisible = section => {
  if (section.to && isAllowed(section.to)) return true;
  return (section.children || []).some(child =>
    child.children ? child.children.length > 0 : isAllowed(child.to)
  );
};

const railVisibleItems = computed(() =>
  menuItems.value.filter(isSectionVisible)
);

// The settings button opens the section at its entry screen (account settings) rather
// than toggling a panel; the sidebar comes from SettingsLayout once we land there.
const { visibleItems: settingsVisibleItems } = useSettingsMenu();
const isSettingsVisible = computed(() => settingsVisibleItems.value.length > 0);
const settingsTo = computed(() => accountScopedRoute(SETTINGS_ENTRY_ROUTE));
const isSettingsActive = computed(() => isSettingsPath(currentPath.value));

// Group a section's children for the flyout: loose leaves first, then each
// sub-group (Teams/Labels/…) under its own label. Static leaves are gated.
const flyoutGroups = section => {
  const groups = [];
  const loose = [];
  (section.children || []).forEach(child => {
    if (child.children) {
      if (child.children.length) {
        groups.push({
          id: child.name,
          label: child.label,
          items: child.children,
          sortOptions: child.sortOptions,
          activeSort: child.activeSort,
          onSortChange: child.onSortChange,
        });
      }
    } else if (isAllowed(child.to)) {
      loose.push(child);
    }
  });
  if (loose.length)
    groups.unshift({ id: '__loose', label: null, items: loose });
  return groups;
};
</script>

<template>
  <aside
    v-on-click-outside="[
      closeMobileSidebar,
      { ignore: ['#mobile-sidebar-launcher'] },
    ]"
    class="flex bg-n-solid-1 rtl:border-l ltr:border-r border-n-weak text-sm fixed top-0 ltr:left-0 rtl:right-0 h-full z-40 transition-transform duration-200 ease-in-out md:static shrink-0 md:ltr:translate-x-0 md:rtl:-translate-x-0"
    :class="[
      {
        'shadow-lg md:shadow-none': isMobileSidebarOpen,
        'ltr:-translate-x-full rtl:translate-x-full': !isMobileSidebarOpen,
      },
    ]"
  >
    <!-- Icon rail (flex column so Settings is reliably pinned to the bottom) -->
    <div class="flex flex-col items-center w-16 h-full gap-1 py-3 shrink-0">
      <NavigationMenu
        disable-viewport
        orientation="vertical"
        :delay-duration="80"
        :skip-delay-duration="300"
        class="flex flex-col items-center justify-start flex-1 w-full min-h-0 gap-1 max-w-none"
      >
        <NavigationMenuList
          class="flex flex-col items-center justify-start flex-none gap-1 m-0 list-none"
        >
          <template v-for="item in railVisibleItems" :key="item.name">
            <li
              v-if="item.name === 'Contacts'"
              role="separator"
              aria-hidden="true"
              class="my-1.5 h-px w-8 bg-n-weak list-none"
            />
            <NavigationMenuItem class="relative">
              <NavigationMenuTrigger
                v-if="item.children"
                unstyled
                :show-chevron="false"
                class="flex items-center justify-center transition-colors rounded-xl size-10 text-n-slate-11 hover:bg-n-alpha-1 hover:text-n-slate-12 data-[state=open]:bg-n-alpha-1 data-[state=open]:text-n-slate-12 outline-none"
                :class="{
                  'bg-n-brand/10 text-n-brand hover:bg-n-brand/10 hover:text-n-brand':
                    sectionMatchesRoute(item),
                }"
                :aria-label="item.label"
                @click="goToSection(item)"
              >
                <span
                  v-tooltip.right="item.label"
                  class="flex items-center justify-center size-full"
                >
                  <Icon :icon="item.icon" class="size-5" />
                </span>
              </NavigationMenuTrigger>

              <NavigationMenuLink v-else as-child>
                <AppLink
                  v-tooltip.right="item.label"
                  :to="item.to"
                  class="flex items-center justify-center transition-colors rounded-xl size-10 text-n-slate-11 hover:bg-n-alpha-1 hover:text-n-slate-12 outline-none"
                  :class="{
                    'bg-n-brand/10 text-n-brand hover:bg-n-brand/10 hover:text-n-brand':
                      sectionMatchesRoute(item),
                  }"
                  :aria-label="item.label"
                >
                  <Icon :icon="item.icon" class="size-5" />
                </AppLink>
              </NavigationMenuLink>

              <span
                v-if="railUnreadCount(item) > 0"
                class="absolute top-0 ltr:right-0 rtl:left-0 min-w-[18px] h-[18px] px-1 rounded-full bg-n-brand text-white text-[10px] font-bold leading-[18px] text-center pointer-events-none"
              >
                {{ railUnreadCount(item) > 99 ? '99+' : railUnreadCount(item) }}
              </span>

              <NavigationMenuContent
                v-if="item.children"
                class="absolute top-0 ltr:left-full rtl:right-full ltr:ml-2 rtl:mr-2 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-n-weak bg-n-solid-1 p-1.5 shadow-lg z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
              >
                <header
                  class="flex items-center gap-2 px-2 py-1.5 mb-1 text-base font-semibold text-n-slate-12 group/sidebar-section"
                >
                  <Icon
                    :icon="item.icon"
                    class="size-4 shrink-0 text-n-slate-11"
                  />
                  <span class="flex-1 min-w-0 truncate">{{ item.label }}</span>
                  <SidebarSortMenu
                    v-if="item.sortOptions?.length"
                    :active-sort="item.activeSort"
                    :options="item.sortOptions"
                    :open-on-hover="false"
                    @sort="item.onSortChange"
                  />
                </header>
                <template v-for="group in flyoutGroups(item)" :key="group.id">
                  <div
                    v-if="group.label"
                    class="flex items-center gap-2 px-2 pt-2 pb-1 group/sidebar-section"
                  >
                    <span
                      class="flex-1 min-w-0 text-xs font-medium tracking-wide uppercase truncate text-n-slate-10"
                    >
                      {{ group.label }}
                    </span>
                    <SidebarSortMenu
                      v-if="group.sortOptions?.length"
                      :active-sort="group.activeSort"
                      :options="group.sortOptions"
                      :open-on-hover="false"
                      @sort="group.onSortChange"
                    />
                  </div>
                  <NavigationMenuLink
                    v-for="leaf in group.items"
                    :key="leaf.name"
                    as-child
                  >
                    <AppLink
                      :to="leaf.to"
                      class="flex items-center w-full gap-2 px-2 py-1.5 rounded-lg text-n-slate-12 hover:bg-n-alpha-1 min-w-0"
                    >
                      <span
                        v-if="leaf.swatch"
                        class="size-3 rounded-sm ring-1 ring-inset ring-n-alpha-1 shrink-0"
                        :style="{ backgroundColor: leaf.swatch }"
                      />
                      <ChannelIcon
                        v-else-if="leaf.inbox"
                        :inbox="leaf.inbox"
                        class="size-4 shrink-0"
                      />
                      <EmojiIcon
                        v-else-if="leaf.emoji"
                        :value="leaf.emoji"
                        :color="leaf.emojiColor"
                        class="size-4 shrink-0"
                      />
                      <Icon
                        v-else-if="typeof leaf.icon === 'string'"
                        :icon="leaf.icon"
                        class="size-4 shrink-0 text-n-slate-11"
                      />
                      <span
                        class="flex-1 min-w-0 truncate"
                        :title="
                          leaf.identifier
                            ? `${leaf.label} ${IDENTIFIER_SEPARATOR} ${leaf.identifier}`
                            : leaf.label
                        "
                      >
                        {{ leaf.label }}
                        <template v-if="leaf.identifier">
                          <span aria-hidden="true" class="mx-0.5 text-n-slate-9">
                            {{ IDENTIFIER_SEPARATOR }}
                          </span>
                          <bdi dir="auto" class="text-n-slate-9">
                            {{ leaf.identifier }}
                          </bdi>
                        </template>
                      </span>
                      <span
                        v-if="leaf.count > 0"
                        class="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-n-brand text-white text-[10px] font-bold leading-[18px] text-center"
                      >
                        {{ leaf.count > 99 ? '99+' : leaf.count }}
                      </span>
                    </AppLink>
                  </NavigationMenuLink>
                </template>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </template>
        </NavigationMenuList>
      </NavigationMenu>

      <!-- Settings pinned to the bottom of the rail -->
      <AppLink
        v-if="isSettingsVisible"
        v-tooltip.right="t('SIDEBAR.SETTINGS')"
        :to="settingsTo"
        class="flex items-center justify-center mt-auto transition-colors rounded-xl size-10 text-n-slate-11 hover:bg-n-alpha-1 hover:text-n-slate-12 outline-none"
        :class="{
          'bg-n-brand/10 text-n-brand hover:bg-n-brand/10 hover:text-n-brand':
            isSettingsActive,
        }"
        :aria-label="t('SIDEBAR.SETTINGS')"
      >
        <Icon icon="i-lucide-settings" class="size-5" />
      </AppLink>
    </div>
  </aside>
</template>
