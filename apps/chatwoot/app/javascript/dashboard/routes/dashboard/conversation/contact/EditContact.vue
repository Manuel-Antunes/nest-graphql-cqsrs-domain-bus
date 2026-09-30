<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Dialog/Button component names */
import { mapGetters } from 'vuex';
import ContactForm from './ContactForm.vue';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'dashboard/components-next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

export default {
  components: {
    ContactForm,
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Spinner,
  },
  props: {
    contact: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      isOpen: false,
    };
  },
  computed: {
    ...mapGetters({
      uiFlags: 'contacts/getUIFlags',
    }),
  },
  methods: {
    onSuccess() {
      this.isOpen = false;
    },
    async onSubmit(contactItem) {
      await this.$store.dispatch('contacts/update', contactItem);
      await this.$store.dispatch(
        'contacts/fetchContactableInbox',
        this.contact.id
      );
    },
  },
};
</script>

<template>
  <Dialog :open="isOpen" @update:open="isOpen = $event">
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ `${$t('EDIT_CONTACT.TITLE')} - ${contact.name || contact.email}` }}
        </DialogTitle>
        <DialogDescription>{{ $t('EDIT_CONTACT.DESC') }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col sm:max-w-2xl max-h-[70vh] overflow-y-auto">
        <ContactForm
          :contact="contact"
          :on-submit="onSubmit"
          @success="onSuccess"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" type="button" @click="isOpen = false">
          {{ $t('CONTACT_FORM.FORM.CANCEL') }}
        </Button>
        <Button
          type="submit"
          form="edit-contact-form"
          :disabled="uiFlags.isUpdating"
        >
          <Spinner v-if="uiFlags.isUpdating" class="size-4 flex-shrink-0" />
          <template v-if="!uiFlags.isUpdating">
            {{ $t('CONTACT_FORM.FORM.SUBMIT') }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
