<script>
import { useAlert } from 'dashboard/composables';
import { useBranding } from 'shared/composables/useBranding';
import { mapGetters } from 'vuex';
import WebhookForm from './WebhookForm.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'dashboard/components-next/ui/dialog';

export default {
  components: {
    WebhookForm,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
  },
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    onClose: {
      type: Function,
      required: true,
    },
  },
  setup() {
    const { replaceInstallationName } = useBranding();
    return {
      replaceInstallationName,
    };
  },
  computed: {
    ...mapGetters({
      uiFlags: 'webhooks/getUIFlags',
    }),
  },
  methods: {
    async onSubmit(webhook) {
      try {
        await this.$store.dispatch('webhooks/create', { webhook });
        useAlert(
          this.$t('INTEGRATION_SETTINGS.WEBHOOK.ADD.API.SUCCESS_MESSAGE')
        );
        this.onClose();
      } catch (error) {
        const message =
          error.response.data.message ||
          this.$t('INTEGRATION_SETTINGS.WEBHOOK.EDIT.API.ERROR_MESSAGE');
        useAlert(message);
      }
    },
  },
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) $emit('close');
      }
    "
  >
    <DialogContent class="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{
          $t('INTEGRATION_SETTINGS.WEBHOOK.ADD.TITLE')
        }}</DialogTitle>
        <DialogDescription>{{
          replaceInstallationName($t('INTEGRATION_SETTINGS.WEBHOOK.FORM.DESC'))
        }}</DialogDescription>
      </DialogHeader>
      <WebhookForm
        :is-submitting="uiFlags.creatingItem"
        :submit-label="$t('INTEGRATION_SETTINGS.WEBHOOK.FORM.ADD_SUBMIT')"
        @submit="onSubmit"
        @cancel="onClose"
      />
    </DialogContent>
  </Dialog>
</template>
