<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Dialog/Button component names */
import { useAlert, useTrack } from 'dashboard/composables';
import MergeContact from 'dashboard/modules/contact/components/MergeContact.vue';

import ContactAPI from 'dashboard/api/contacts';

import { mapGetters } from 'vuex';
import { CONTACTS_EVENTS } from '../../helper/AnalyticsHelper/events';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

export default {
  components: {
    MergeContact,
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    Button,
    Spinner,
  },
  props: {
    primaryContact: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      isOpen: false,
      isSearching: false,
      searchResults: [],
    };
  },
  computed: {
    ...mapGetters({
      uiFlags: 'contacts/getUIFlags',
    }),
  },

  methods: {
    onClose() {
      this.isOpen = false;
    },
    async onContactSearch(query) {
      this.isSearching = true;
      this.searchResults = [];

      try {
        const {
          data: { payload },
        } = await ContactAPI.search(query);
        this.searchResults = payload.filter(
          contact => contact.id !== this.primaryContact.id
        );
      } catch (error) {
        useAlert(this.$t('MERGE_CONTACTS.SEARCH.ERROR_MESSAGE'));
      } finally {
        this.isSearching = false;
      }
    },
    async onMergeContacts(parentContactId) {
      useTrack(CONTACTS_EVENTS.MERGED_CONTACTS);
      try {
        await this.$store.dispatch('contacts/merge', {
          childId: this.primaryContact.id,
          parentId: parentContactId,
        });
        useAlert(this.$t('MERGE_CONTACTS.FORM.SUCCESS_MESSAGE'));
        this.onClose();
      } catch (error) {
        useAlert(this.$t('MERGE_CONTACTS.FORM.ERROR_MESSAGE'));
      }
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
        <DialogTitle>{{ $t('MERGE_CONTACTS.TITLE') }}</DialogTitle>
        <DialogDescription>
          {{ $t('MERGE_CONTACTS.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>

      <MergeContact
        :primary-contact="primaryContact"
        :is-searching="isSearching"
        :search-results="searchResults"
        @search="onContactSearch"
        @submit="onMergeContacts"
      />

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline" type="button">
            {{ $t('MERGE_CONTACTS.FORM.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          type="submit"
          form="merge-contact-form"
          :disabled="uiFlags.isMerging"
        >
          <Spinner v-if="uiFlags.isMerging" class="mr-2 size-6" />
          {{ $t('MERGE_CONTACTS.FORM.SUBMIT') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
