<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn component names */
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useBranding } from 'shared/composables/useBranding';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
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
import NewWebhook from './NewWebHook.vue';
import EditWebhook from './EditWebHook.vue';
import WebhookRow from './WebhookRow.vue';
import BaseSettingsHeader from '../../components/BaseSettingsHeader.vue';
import SettingsLayout from '../../SettingsLayout.vue';

export default {
  components: {
    SettingsLayout,
    Button,
    Icon,
    BaseSettingsHeader,
    NewWebhook,
    EditWebhook,
    WebhookRow,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
  },
  setup() {
    const { replaceInstallationName } = useBranding();
    return { replaceInstallationName };
  },
  data() {
    return {
      loading: {},
      showAddPopup: false,
      showEditPopup: false,
      showDeleteConfirmationPopup: false,
      selectedWebHook: {},
    };
  },
  computed: {
    ...mapGetters({
      records: 'webhooks/getWebhooks',
      uiFlags: 'webhooks/getUIFlags',
    }),
    integration() {
      return this.$store.getters['integrations/getIntegration']('webhook');
    },
    tableHeaders() {
      return [
        this.$t(
          'INTEGRATION_SETTINGS.WEBHOOK.LIST.TABLE_HEADER.WEBHOOK_ENDPOINT'
        ),
        this.$t('INTEGRATION_SETTINGS.WEBHOOK.LIST.TABLE_HEADER.ACTIONS'),
      ];
    },
  },
  mounted() {
    // The header (title/description) + "Add webhook" button are gated on the
    // `webhook` integration's metadata from the integrations store. Slack/Linear/
    // etc. fetch it in their own mounted; this page only fetched the webhook list,
    // so on a direct load (Inertia full page load, no prior visit to the
    // integrations index that preloads it) the header vanished. Fetch both.
    this.$store.dispatch('integrations/get');
    this.$store.dispatch('webhooks/get');
  },
  methods: {
    openAddPopup() {
      this.showAddPopup = true;
    },
    hideAddPopup() {
      this.showAddPopup = false;
    },
    openDeletePopup(response) {
      this.showDeleteConfirmationPopup = true;
      this.selectedWebHook = response;
    },
    closeDeletePopup() {
      this.showDeleteConfirmationPopup = false;
    },
    openEditPopup(webhook) {
      this.showEditPopup = true;
      this.selectedWebHook = webhook;
    },
    hideEditPopup() {
      this.showEditPopup = false;
    },
    confirmDeletion() {
      this.loading[this.selectedWebHook.id] = true;
      this.closeDeletePopup();
      this.deleteWebhook(this.selectedWebHook.id);
    },
    async deleteWebhook(id) {
      try {
        await this.$store.dispatch('webhooks/delete', id);
        useAlert(
          this.$t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.API.SUCCESS_MESSAGE')
        );
      } catch (error) {
        useAlert(
          this.$t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.API.ERROR_MESSAGE')
        );
      }
    },
  },
};
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.fetchingList"
    :loading-message="$t('INTEGRATION_SETTINGS.WEBHOOK.LOADING')"
    :no-records-message="$t('INTEGRATION_SETTINGS.WEBHOOK.LIST.404')"
    :no-records-found="!records.length"
  >
    <template #header>
      <BaseSettingsHeader
        v-if="integration.name"
        :title="integration.name"
        :description="replaceInstallationName(integration.description)"
        :link-text="$t('INTEGRATION_SETTINGS.WEBHOOK.LEARN_MORE')"
        feature-name="webhook"
        :back-button-label="$t('INTEGRATION_SETTINGS.HEADER')"
      >
        <template #actions>
          <Button @click="openAddPopup">
            <Icon icon="i-lucide-circle-plus" />
            {{ $t('INTEGRATION_SETTINGS.WEBHOOK.HEADER_BTN_TXT') }}
          </Button>
        </template>
      </BaseSettingsHeader>
    </template>
    <template #body>
      <table class="min-w-full divide-y divide-n-weak">
        <thead>
          <th
            v-for="thHeader in tableHeaders"
            :key="thHeader"
            class="py-4 ltr:pr-4 rtl:pl-4 text-left font-semibold text-n-slate-11 last:text-right last:pr-4"
          >
            {{ thHeader }}
          </th>
        </thead>
        <tbody class="divide-y divide-n-weak flex-1 text-n-slate-12">
          <WebhookRow
            v-for="(webHookItem, index) in records"
            :key="webHookItem.id"
            :index="index"
            :webhook="webHookItem"
            @edit="openEditPopup"
            @delete="openDeletePopup"
          />
        </tbody>
      </table>
    </template>
    <NewWebhook
      v-if="showAddPopup"
      :open="showAddPopup"
      :on-close="hideAddPopup"
      @close="hideAddPopup"
    />

    <EditWebhook
      v-if="showEditPopup"
      :id="selectedWebHook.id"
      :open="showEditPopup"
      :value="selectedWebHook"
      :on-close="hideEditPopup"
      @close="hideEditPopup"
    />
    <AlertDialog
      :open="showDeleteConfirmationPopup"
      @update:open="showDeleteConfirmationPopup = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{
              $t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.MESSAGE', {
                webhookURL: selectedWebHook.url,
              })
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="closeDeletePopup">
            {{ $t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.NO') }}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeletion">
            {{ $t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.YES') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SettingsLayout>
</template>
