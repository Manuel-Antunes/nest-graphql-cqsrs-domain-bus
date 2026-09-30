<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn component names */
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
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
import { picoSearch } from '@chatwoot/pico-search';
import { BaseTable } from 'dashboard/components-next/table';
import DashboardAppModal from './DashboardAppModal.vue';
import DashboardAppsRow from './DashboardAppsRow.vue';
import BaseSettingsHeader from '../../components/BaseSettingsHeader.vue';
import SettingsLayout from '../../SettingsLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    BaseSettingsHeader,
    SettingsLayout,
    BaseTable,
    DashboardAppModal,
    DashboardAppsRow,
    Button,
    Icon,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
  },
  data() {
    return {
      loading: {},
      showDashboardAppPopup: false,
      showDeleteConfirmationPopup: false,
      selectedApp: {},
      mode: 'CREATE',
      searchQuery: '',
    };
  },
  computed: {
    ...mapGetters({
      records: 'dashboardApps/getRecords',
      uiFlags: 'dashboardApps/getUIFlags',
    }),
    filteredRecords() {
      const query = this.searchQuery.trim();
      if (!query) return this.records;
      return picoSearch(this.records, query, ['title']);
    },
    tableHeaders() {
      return [
        this.$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.TABLE_HEADER.NAME'),
        this.$t(
          'INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.TABLE_HEADER.ENDPOINT'
        ),
        this.$t(
          'INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.TABLE_HEADER.ACTIONS'
        ),
      ];
    },
  },
  mounted() {
    this.$store.dispatch('dashboardApps/get');
  },
  methods: {
    toggleDashboardAppPopup() {
      this.showDashboardAppPopup = !this.showDashboardAppPopup;
      this.selectedApp = {};
    },
    openDeletePopup(response) {
      this.showDeleteConfirmationPopup = true;
      this.selectedApp = response;
    },
    openCreatePopup() {
      this.mode = 'CREATE';
      this.selectedApp = {};
      this.showDashboardAppPopup = true;
    },
    closeDeletePopup() {
      this.showDeleteConfirmationPopup = false;
    },
    editApp(app) {
      this.loading[app.id] = true;
      this.mode = 'UPDATE';
      this.selectedApp = app;
      this.showDashboardAppPopup = true;
    },
    confirmDeletion() {
      this.loading[this.selectedApp.id] = true;
      this.closeDeletePopup();
      this.deleteApp(this.selectedApp.id);
    },
    async deleteApp(id) {
      try {
        await this.$store.dispatch('dashboardApps/delete', id);
        useAlert(
          this.$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DELETE.API_SUCCESS')
        );
      } catch (error) {
        useAlert(
          this.$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DELETE.API_ERROR')
        );
      }
    },
  },
};
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.isFetching"
    :loading-message="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.LOADING')"
    :no-records-found="!records.length"
    :no-records-message="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.404')"
  >
    <template #header>
      <BaseSettingsHeader
        v-model:search-query="searchQuery"
        :title="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.TITLE')"
        :description="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DESCRIPTION')"
        :link-text="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LEARN_MORE')"
        :search-placeholder="
          $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.SEARCH_PLACEHOLDER')
        "
        feature-name="dashboard_apps"
        :back-button-label="$t('INTEGRATION_SETTINGS.HEADER')"
      >
        <template v-if="records?.length" #count>
          <span class="text-body-main text-n-slate-11">
            {{
              $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.COUNT', {
                n: records.length,
              })
            }}
          </span>
        </template>
        <template #actions>
          <Button @click="openCreatePopup">
            <Icon icon="i-lucide-circle-plus" />
            {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.HEADER_BTN_TXT') }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <span
        v-if="!filteredRecords.length && searchQuery"
        class="flex-1 flex items-center justify-center py-20 text-center text-body-main !text-base text-n-slate-11"
      >
        {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.NO_RESULTS') }}
      </span>
      <BaseTable v-else :headers="tableHeaders" :items="filteredRecords">
        <template #row="{ items }">
          <DashboardAppsRow
            v-for="(dashboardAppItem, index) in items"
            :key="dashboardAppItem.id"
            :index="index"
            :app="dashboardAppItem"
            @edit="editApp"
            @delete="openDeletePopup"
          />
        </template>
      </BaseTable>
    </template>
    <DashboardAppModal
      v-if="showDashboardAppPopup"
      :show="showDashboardAppPopup"
      :mode="mode"
      :selected-app-data="selectedApp"
      @close="toggleDashboardAppPopup"
    />

    <AlertDialog
      :open="showDeleteConfirmationPopup"
      @update:open="showDeleteConfirmationPopup = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DELETE.TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{
              $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DELETE.MESSAGE', {
                appName: selectedApp.title,
              })
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="closeDeletePopup">
            {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DELETE.CONFIRM_NO') }}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeletion">
            {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DELETE.CONFIRM_YES') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SettingsLayout>
</template>
