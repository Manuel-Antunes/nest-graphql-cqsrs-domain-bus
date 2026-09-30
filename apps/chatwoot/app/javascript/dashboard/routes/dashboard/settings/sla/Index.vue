<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { convertSecondsToTimeUnit } from '@chatwoot/utils';
import { picoSearch } from '@chatwoot/pico-search';
import { useAlert } from 'dashboard/composables';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import AddSLA from './AddSLA.vue';
import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from 'dashboard/routes/dashboard/settings/components/BaseSettingsHeader.vue';
import SLAPaywallEnterprise from './SLAPaywallEnterprise.vue';
import {
  BaseTable,
  BaseTableRow,
  BaseTableCell,
} from 'dashboard/components-next/table';
import WootLabel from 'dashboard/components-next/label/Label.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';

const store = useStore();
const { t } = useI18n();
const { visit } = useAppNavigation();

const isOnChatwootCloud = useMapGetter('globalConfig/isOnChatwootCloud');
const isFeatureEnabledonAccount = useMapGetter(
  'accounts/isFeatureEnabledonAccount'
);
const records = useMapGetter('sla/getSLA');
const currentUser = useMapGetter('getCurrentUser');
const accountId = useMapGetter('getCurrentAccountId');
const uiFlags = useMapGetter('sla/getUIFlags');

const loading = ref({});
const showAddPopup = ref(false);
const showDeleteConfirmationPopup = ref(false);
const selectedResponse = ref({});
const searchQuery = ref('');

const deleteConfirmText = computed(() => t('SLA.DELETE.CONFIRM.YES'));
const deleteRejectText = computed(() => t('SLA.DELETE.CONFIRM.NO'));
const deleteMessage = computed(() => ` ${selectedResponse.value.name}`);

const isBehindAPaywall = computed(
  () => !isFeatureEnabledonAccount.value(accountId.value, 'sla')
);
const isSuperAdmin = computed(() => currentUser.value.type === 'SuperAdmin');

const tableHeaders = computed(() => [
  t('SLA.LIST.TABLE_HEADER.SLA'),
  t('SLA.LIST.TABLE_HEADER.BUSINESS_HOURS'),
  t('SLA.LIST.RESPONSE_TYPES.SHORT_HAND.FRT'),
  t('SLA.LIST.RESPONSE_TYPES.SHORT_HAND.NRT'),
  t('SLA.LIST.RESPONSE_TYPES.SHORT_HAND.RT'),
  t('INTEGRATION_APPS.LIST.ACTIONS'),
]);

const filteredRecords = computed(() => {
  const query = searchQuery.value.trim();
  if (!query) return records.value;
  return picoSearch(records.value, query, ['name', 'description']);
});

const openAddPopup = () => {
  if (isBehindAPaywall.value) {
    return;
  }
  showAddPopup.value = true;
};

const hideAddPopup = () => {
  showAddPopup.value = false;
};

const openDeletePopup = response => {
  showDeleteConfirmationPopup.value = true;
  selectedResponse.value = response;
};

const closeDeletePopup = () => {
  showDeleteConfirmationPopup.value = false;
};

const deleteSla = id => {
  store
    .dispatch('sla/delete', id)
    .then(() => {
      useAlert(t('SLA.DELETE.API.SUCCESS_MESSAGE'));
    })
    .catch(() => {
      useAlert(t('SLA.DELETE.API.ERROR_MESSAGE'));
    })
    .finally(() => {
      loading.value[selectedResponse.value.id] = false;
    });
};

const confirmDeletion = () => {
  loading.value[selectedResponse.value.id] = true;
  closeDeletePopup();
  deleteSla(selectedResponse.value.id);
};

const displayTime = threshold => {
  const { time, unit } = convertSecondsToTimeUnit(threshold, {
    minute: 'm',
    hour: 'h',
    day: 'd',
  });
  if (!time) return '-';
  return `${time}${unit}`;
};

const onClickCTA = () => {
  visit({
    name: 'billing_settings_index',
    params: { accountId: accountId.value },
  });
};

onMounted(() => {
  store.dispatch('sla/get');
});
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.isFetching"
    :loading-message="$t('SLA.LOADING')"
  >
    <template #header>
      <BaseSettingsHeader
        v-model:search-query="searchQuery"
        :title="$t('SLA.HEADER')"
        :description="$t('SLA.DESCRIPTION')"
        :link-text="$t('SLA.LEARN_MORE')"
        :search-placeholder="
          isBehindAPaywall ? '' : $t('SLA.SEARCH_PLACEHOLDER')
        "
        feature-name="sla"
      >
        <template v-if="!isBehindAPaywall && records?.length" #count>
          <span class="text-body-main text-n-slate-11">
            {{ $t('SLA.COUNT', { n: records.length }) }}
          </span>
        </template>
        <template v-if="!isBehindAPaywall" #actions>
          <Button @click="openAddPopup">
            <Icon icon="i-lucide-circle-plus" class="size-4" />
            {{ $t('SLA.ADD_ACTION') }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <SLAPaywallEnterprise
        v-if="isBehindAPaywall"
        :is-super-admin="isSuperAdmin"
        :is-on-chatwoot-cloud="isOnChatwootCloud"
        @upgrade="onClickCTA"
      />
      <BaseTable
        v-else
        :headers="tableHeaders"
        :items="filteredRecords"
        :no-data-message="
          !records.length
            ? $t('SLA.LIST.404')
            : searchQuery && !filteredRecords.length
              ? $t('SLA.SEARCH.NO_RESULTS')
              : ''
        "
      >
        <template #header-2>
          <div class="flex items-center gap-1">
            <span class="text-heading-3">
              {{ $t('SLA.LIST.RESPONSE_TYPES.SHORT_HAND.FRT') }}
            </span>
            <Icon
              v-tooltip.left="$t('SLA.LIST.RESPONSE_TYPES.FRT')"
              icon="i-lucide-info"
              class="size-3.5 text-n-slate-10 cursor-help"
            />
          </div>
        </template>
        <template #header-3>
          <div class="flex items-center gap-1">
            <span class="text-heading-3">
              {{ $t('SLA.LIST.RESPONSE_TYPES.SHORT_HAND.NRT') }}
            </span>
            <Icon
              v-tooltip.left="$t('SLA.LIST.RESPONSE_TYPES.NRT')"
              icon="i-lucide-info"
              class="size-3.5 text-n-slate-10 cursor-help"
            />
          </div>
        </template>
        <template #header-4>
          <div class="flex items-center gap-1">
            <span class="text-heading-3">
              {{ $t('SLA.LIST.RESPONSE_TYPES.SHORT_HAND.RT') }}
            </span>
            <Icon
              v-tooltip.left="$t('SLA.LIST.RESPONSE_TYPES.RT')"
              icon="i-lucide-info"
              class="size-3.5 text-n-slate-10 cursor-help"
            />
          </div>
        </template>
        <template #row="{ items }">
          <BaseTableRow v-for="sla in items" :key="sla.id" :item="sla">
            <template #default>
              <BaseTableCell>
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="text-body-main text-n-slate-12 truncate">
                    {{ sla.name }}
                  </span>
                  <span class="text-body-main text-n-slate-11 line-clamp-1">
                    {{ sla.description }}
                  </span>
                </div>
              </BaseTableCell>

              <BaseTableCell class="w-40">
                <WootLabel
                  :label="
                    sla.only_during_business_hours
                      ? $t('SLA.LIST.BUSINESS_HOURS_ON')
                      : $t('SLA.LIST.BUSINESS_HOURS_OFF')
                  "
                  :color="sla.only_during_business_hours ? 'teal' : 'slate'"
                  compact
                >
                  <template #icon>
                    <Icon
                      :icon="
                        sla.only_during_business_hours
                          ? 'i-lucide-alarm-clock-check'
                          : 'i-lucide-alarm-clock-off'
                      "
                      class="size-3.5"
                      :class="
                        sla.only_during_business_hours
                          ? 'text-n-teal-11'
                          : 'text-n-slate-11'
                      "
                    />
                  </template>
                </WootLabel>
              </BaseTableCell>

              <BaseTableCell align="start" class="w-24">
                <span class="text-body-main text-n-slate-12">
                  {{ displayTime(sla.first_response_time_threshold) }}
                </span>
              </BaseTableCell>

              <BaseTableCell align="start" class="w-24">
                <span class="text-body-main text-n-slate-12">
                  {{ displayTime(sla.next_response_time_threshold) }}
                </span>
              </BaseTableCell>

              <BaseTableCell align="start" class="w-24">
                <span class="text-body-main text-n-slate-12">
                  {{ displayTime(sla.resolution_time_threshold) }}
                </span>
              </BaseTableCell>

              <BaseTableCell align="end" class="w-12">
                <div class="flex justify-end">
                  <Button
                    v-tooltip.top="$t('SLA.FORM.DELETE')"
                    variant="destructive"
                    size="icon"
                    :disabled="loading[sla.id]"
                    @click="openDeletePopup(sla)"
                  >
                    <Spinner
                      v-if="loading[sla.id]"
                      class="size-4 flex-shrink-0"
                    />
                    <template v-if="!loading[sla.id]">
                      <Icon icon="i-lucide-trash-2" />
                    </template>
                  </Button>
                </div>
              </BaseTableCell>
            </template>
          </BaseTableRow>
        </template>
      </BaseTable>

      <AddSLA :open="showAddPopup" @close="hideAddPopup" />

      <AlertDialog
        :open="showDeleteConfirmationPopup"
        @update:open="showDeleteConfirmationPopup = $event"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {{ $t('SLA.DELETE.CONFIRM.TITLE') }}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {{ $t('SLA.DELETE.CONFIRM.MESSAGE') }}
              {{ deleteMessage }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="closeDeletePopup">
              {{ deleteRejectText }}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" @click="confirmDeletion">
              {{ deleteConfirmText }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>
  </SettingsLayout>
</template>
