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
import DashboardAppModal from './DashboardAppModal.vue';
import DashboardAppsRow from './DashboardAppsRow.vue';
import BaseSettingsHeader from '../../components/BaseSettingsHeader.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    BaseSettingsHeader,
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
    };
  },
  computed: {
    ...mapGetters({
      records: 'dashboardApps/getRecords',
      uiFlags: 'dashboardApps/getUIFlags',
    }),
    tableHeaders() {
      return [
        this.$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.TABLE_HEADER.NAME'),
        this.$t(
          'INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.TABLE_HEADER.ENDPOINT'
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
  <div class="flex flex-col flex-1 gap-8 overflow-auto">
    <BaseSettingsHeader
      :title="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.TITLE')"
      :description="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.DESCRIPTION')"
      :link-text="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LEARN_MORE')"
      feature-name="dashboard_apps"
      :back-button-label="$t('INTEGRATION_SETTINGS.HEADER')"
    >
      <template #actions>
        <Button @click="openCreatePopup">
          <Icon icon="i-lucide-circle-plus" />
          {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.HEADER_BTN_TXT') }}
        </Button>
      </template>
    </BaseSettingsHeader>
    <div class="w-full overflow-x-auto text-n-slate-11">
      <p
        v-if="!uiFlags.isFetching && !records.length"
        class="flex flex-col items-center justify-center h-full"
      >
        {{ $t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.404') }}
      </p>
      <woot-loading-state
        v-if="uiFlags.isFetching"
        :message="$t('INTEGRATION_SETTINGS.DASHBOARD_APPS.LIST.LOADING')"
      />
      <table
        v-if="!uiFlags.isFetching && records.length"
        class="min-w-full divide-y divide-n-weak"
      >
        <thead>
          <th
            v-for="thHeader in tableHeaders"
            :key="thHeader"
            class="py-4 ltr:pr-4 rtl:pl-4 font-semibold text-left text-n-slate-11"
          >
            {{ thHeader }}
          </th>
        </thead>
        <tbody class="divide-y divide-n-weak">
          <DashboardAppsRow
            v-for="(dashboardAppItem, index) in records"
            :key="dashboardAppItem.id"
            :index="index"
            :app="dashboardAppItem"
            @edit="editApp"
            @delete="openDeletePopup"
          />
        </tbody>
      </table>
    </div>

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
  </div>
</template>
