<script>
import { useAlert } from 'dashboard/composables';
import SlaForm from './SlaForm.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'dashboard/components-next/ui/dialog';

export default {
  components: {
    SlaForm,
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
  },
  emits: ['close'],
  methods: {
    onClose() {
      this.$emit('close');
    },
    async addSLA(payload) {
      try {
        await this.$store.dispatch('sla/create', payload);
        useAlert(this.$t('SLA.ADD.API.SUCCESS_MESSAGE'));
        this.onClose();
      } catch (error) {
        const errorMessage =
          error.message || this.$t('SLA.ADD.API.ERROR_MESSAGE');
        useAlert(errorMessage);
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
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('SLA.ADD.TITLE') }}</DialogTitle>
        <DialogDescription>{{ $t('SLA.ADD.DESC') }}</DialogDescription>
      </DialogHeader>
      <SlaForm
        :submit-label="$t('SLA.FORM.CREATE')"
        @submit-sla="addSLA"
        @close="onClose"
      />
    </DialogContent>
  </Dialog>
</template>
