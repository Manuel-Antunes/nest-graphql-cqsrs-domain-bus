<script>
import { isEmptyObject } from '../../../../helper/commons';
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useIntegrationHook } from 'dashboard/composables/useIntegrationHook';
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
import NewHook from './NewHook.vue';
import SingleIntegrationHooks from './SingleIntegrationHooks.vue';
import MultipleIntegrationHooks from './MultipleIntegrationHooks.vue';
import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';

export default {
  components: {
    NewHook,
    SingleIntegrationHooks,
    MultipleIntegrationHooks,
    SettingsLayout,
    BaseSettingsHeader,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
  },
  props: {
    integrationId: {
      type: [String, Number],
      required: true,
    },
  },
  setup(props) {
    const { integrationId } = props;

    const {
      integration,
      isIntegrationMultiple,
      isIntegrationSingle,
      isHookTypeInbox,
    } = useIntegrationHook(integrationId);

    return {
      integration,
      isIntegrationMultiple,
      isIntegrationSingle,
      isHookTypeInbox,
    };
  },
  data() {
    return {
      loading: {},
      showAddHookModal: false,
      showDeleteConfirmationPopup: false,
      selectedHook: {},
      alertMessage: '',
    };
  },
  computed: {
    ...mapGetters({ uiFlags: 'integrations/getUIFlags' }),
    showIntegrationHooks() {
      return !this.uiFlags.isFetching && !isEmptyObject(this.integration);
    },
    showAddButton() {
      return this.showIntegrationHooks && this.isIntegrationMultiple;
    },
    deleteTitle() {
      return this.isHookTypeInbox
        ? this.$t('INTEGRATION_APPS.DELETE.TITLE.INBOX')
        : this.$t('INTEGRATION_APPS.DELETE.TITLE.ACCOUNT');
    },
    deleteMessage() {
      return this.isHookTypeInbox
        ? this.$t('INTEGRATION_APPS.DELETE.MESSAGE.INBOX')
        : this.$t('INTEGRATION_APPS.DELETE.MESSAGE.ACCOUNT');
    },
    confirmText() {
      return this.isHookTypeInbox
        ? this.$t('INTEGRATION_APPS.DELETE.CONFIRM_BUTTON_TEXT.INBOX')
        : this.$t('INTEGRATION_APPS.DELETE.CONFIRM_BUTTON_TEXT.ACCOUNT');
    },
    cancelText() {
      return this.$t('INTEGRATION_APPS.DELETE.CANCEL_BUTTON_TEXT');
    },
  },
  mounted() {
    // Header + hooks are gated on this integration's metadata; on a direct load
    // (no prior visit to the integrations index that preloads it) the store is
    // empty and the page renders blank, so fetch it here.
    this.$store.dispatch('integrations/get');
  },
  methods: {
    openAddHookModal() {
      this.showAddHookModal = true;
    },
    hideAddHookModal() {
      this.showAddHookModal = false;
    },
    openDeletePopup(response) {
      this.showDeleteConfirmationPopup = true;
      this.selectedHook = response;
    },
    closeDeletePopup() {
      this.showDeleteConfirmationPopup = false;
    },
    async confirmDeletion() {
      try {
        await this.$store.dispatch('integrations/deleteHook', {
          hookId: this.selectedHook.id,
          appId: this.selectedHook.app_id,
        });
        this.alertMessage = this.$t(
          'INTEGRATION_APPS.DELETE.API.SUCCESS_MESSAGE'
        );
        this.closeDeletePopup();
      } catch (error) {
        const errorMessage = error?.response?.data?.message;
        this.alertMessage =
          errorMessage || this.$t('INTEGRATION_APPS.DELETE.API.ERROR_MESSAGE');
      } finally {
        useAlert(this.alertMessage);
      }
    },
  },
};
</script>

<template>
  <SettingsLayout :is-loading="uiFlags.isFetching">
    <template v-if="isIntegrationSingle" #header>
      <BaseSettingsHeader
        :title="integration.name || ''"
        description=""
        :feature-name="integrationId"
        :back-button-label="$t('INTEGRATION_SETTINGS.HEADER')"
      />
    </template>
    <template #body>
      <div v-if="showIntegrationHooks" class="w-full">
        <div v-if="isIntegrationMultiple">
          <MultipleIntegrationHooks
            :integration-id="integrationId"
            :show-add-button="showAddButton"
            @add="openAddHookModal"
            @delete="openDeletePopup"
          />
        </div>

        <div v-if="isIntegrationSingle">
          <SingleIntegrationHooks
            :integration-id="integrationId"
            @add="openAddHookModal"
            @delete="openDeletePopup"
          />
        </div>
      </div>
    </template>

    <NewHook
      :open="showAddHookModal"
      :integration-id="integrationId"
      @close="hideAddHookModal"
    />

    <AlertDialog
      :open="showDeleteConfirmationPopup"
      @update:open="showDeleteConfirmationPopup = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ deleteTitle }}</AlertDialogTitle>
          <AlertDialogDescription>{{ deleteMessage }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="closeDeletePopup">
            {{ cancelText }}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeletion">
            {{ confirmText }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SettingsLayout>
</template>
