<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { until } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { isVoiceCallEnabled } from 'dashboard/helper/inbox';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';
import { useCallHistoryStore } from 'dashboard/stores/callHistory';

import CallListItem from 'dashboard/components-next/Calls/CallListItem.vue';
import CallsEmptyState from 'dashboard/components-next/Calls/CallsEmptyState.vue';
import CallsFilterBar from 'dashboard/components-next/Calls/CallsFilterBar.vue';
import { CALL_ACTIVITY_PARAMS } from 'dashboard/components-next/Calls/constants';
import PaginationFooter from 'dashboard/components-next/pagination/PaginationFooter.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import { Skeleton } from 'dashboard/components-next/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from 'dashboard/components-next/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from 'dashboard/components-next/ui/table';

const RESULTS_PER_PAGE = 25;
const SKELETON_ROWS = 6;

const { t } = useI18n();
const store = useStore();
const callHistoryStore = useCallHistoryStore();

const inboxes = useMapGetter('inboxes/getInboxes');
const accountId = useMapGetter('getCurrentAccountId');
const currentUserId = useMapGetter('getCurrentUserID');
const agents = useMapGetter('agents/getVerifiedAgents');
const isFeatureEnabledonAccount = useMapGetter(
  'accounts/isFeatureEnabledonAccount'
);

// CallFinder scopes non-admins to their own accepted calls, so the assignee
// filter is only meaningful for admins; everyone else defaults to themselves.
const { isAdmin } = useAdmin();

const voiceInboxes = computed(() => inboxes.value.filter(isVoiceCallEnabled));

const isVoiceEnabled = computed(
  () =>
    isFeatureEnabledonAccount.value(
      accountId.value,
      FEATURE_FLAGS.CHANNEL_VOICE
    ) && voiceInboxes.value.length > 0
);

const calls = computed(() => callHistoryStore.records);
const meta = computed(() => callHistoryStore.meta);
const isFetching = computed(() => callHistoryStore.uiFlags.isFetching);
const accountUiFlags = useMapGetter('accounts/getUIFlags');

const isInitializing = ref(true);

// Filters are seeded from the URL so a shared link restores the same view.
const initialQuery = new URLSearchParams(window.location.search);
const queryActivity = initialQuery.get('activity');

const activity = ref(
  CALL_ACTIVITY_PARAMS[queryActivity] ? queryActivity : null
);

const assigneeId = ref(
  isAdmin.value
    ? Number(initialQuery.get('assignee_id')) || null
    : currentUserId.value
);
const inboxId = ref(Number(initialQuery.get('inbox_id')) || null);
const currentPage = ref(Number(initialQuery.get('page')) || 1);

const syncFiltersToUrl = () => {
  const query = new URLSearchParams({
    ...(activity.value && { activity: activity.value }),
    ...(isAdmin.value &&
      assigneeId.value && { assignee_id: String(assigneeId.value) }),
    ...(inboxId.value && { inbox_id: String(inboxId.value) }),
    ...(currentPage.value > 1 && { page: String(currentPage.value) }),
  }).toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState(window.history.state, '', url);
};

const fetchCalls = async () => {
  syncFiltersToUrl();
  try {
    await callHistoryStore.fetchCalls({
      page: currentPage.value,
      ...(CALL_ACTIVITY_PARAMS[activity.value] || {}),
      ...(assigneeId.value ? { agent_id: assigneeId.value } : {}),
      ...(inboxId.value ? { inbox_id: inboxId.value } : {}),
    });
  } catch (error) {
    useAlert(error.message);
  }
};

watch([activity, assigneeId, inboxId], () => {
  currentPage.value = 1;
  fetchCalls();
});

const onPageChange = page => {
  currentPage.value = page;
  fetchCalls();
};

onMounted(async () => {
  try {
    await Promise.all([
      store.dispatch('inboxes/get'),
      until(() => accountUiFlags.value.isFetchingItem).toBe(false),
    ]);
    if (!isVoiceEnabled.value) return;
    // Only admins see the assignee filter, so only they need the agent list.
    if (isAdmin.value) store.dispatch('agents/get');
    await fetchCalls();
  } finally {
    isInitializing.value = false;
  }
});
</script>

<template>
  <div
    v-if="isInitializing"
    class="flex items-center justify-center w-full h-full bg-n-background"
    data-test="calls-initializing"
  >
    <Spinner class="size-6 text-n-slate-11" />
  </div>
  <CallsEmptyState v-else-if="!isVoiceEnabled" />
  <section
    v-else
    class="flex flex-col w-full h-full overflow-hidden bg-n-background"
  >
    <header class="sticky top-0 z-10 shrink-0">
      <div class="w-full px-6 pt-6 mx-auto max-w-[60rem]">
        <h1 class="text-xl font-medium truncate text-n-slate-12">
          {{ t('CALLS_PAGE.HEADER') }}
        </h1>
        <CallsFilterBar
          v-model:activity="activity"
          v-model:assignee-id="assigneeId"
          v-model:inbox-id="inboxId"
          class="pb-4 mt-5 border-b border-n-weak"
          :total-count="isFetching ? null : meta.count"
          :agents="agents"
          :inboxes="voiceInboxes"
          :show-assignee="isAdmin"
        />
      </div>
    </header>
    <main class="flex-1 overflow-y-auto">
      <div class="w-full px-6 mx-auto max-w-[60rem]">
        <Table v-if="isFetching" data-test="calls-loading">
          <TableBody>
            <TableRow
              v-for="row in SKELETON_ROWS"
              :key="row"
              class="border-n-weak hover:bg-transparent"
            >
              <TableCell class="py-3 ltr:pl-0 rtl:pr-0">
                <div class="flex items-center gap-2.5">
                  <Skeleton class="rounded-full size-6" />
                  <Skeleton class="w-32 h-4" />
                </div>
              </TableCell>
              <TableCell class="py-3">
                <Skeleton class="w-40 h-6" />
              </TableCell>
              <TableCell class="py-3">
                <Skeleton class="w-48 h-8 rounded-full" />
              </TableCell>
              <TableCell class="py-3 ltr:pr-0 rtl:pl-0">
                <Skeleton class="w-12 h-4 ms-auto" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Empty v-else-if="!calls.length" class="py-16" data-test="calls-empty">
          <EmptyHeader>
            <EmptyTitle class="text-base font-normal text-n-slate-11">
              {{ t('CALLS_PAGE.EMPTY_STATE') }}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
        <Table v-else data-test="calls-table">
          <TableBody>
            <CallListItem v-for="call in calls" :key="call.id" :call="call" />
          </TableBody>
        </Table>
      </div>
    </main>
    <footer v-if="calls.length" class="sticky bottom-0 z-0 px-4 pb-4 shrink-0">
      <PaginationFooter
        :current-page="currentPage"
        :total-items="meta.count"
        :items-per-page="RESULTS_PER_PAGE"
        @update:current-page="onPageChange"
      />
    </footer>
  </section>
</template>
