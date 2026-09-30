<script setup>
import { reactive, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { required } from '@vuelidate/validators';
import { useVuelidate } from '@vuelidate/core';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useAlert, useTrack } from 'dashboard/composables';
import ContactAPI from 'dashboard/api/contacts';
import { debounce } from '@chatwoot/utils';
import { CONTACTS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import ContactMergeForm from 'dashboard/components-next/Contacts/ContactsForm/ContactMergeForm.vue';

const props = defineProps({
  selectedContact: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['goToContactsList', 'resetTab']);

const { t } = useI18n();
const store = useStore();
const { currentParams } = useAppNavigation();

const state = reactive({
  primaryContactId: null,
});

const uiFlags = useMapGetter('contacts/getUIFlags');

const searchResults = ref([]);
const isSearching = ref(false);

const validationRules = {
  primaryContactId: { required },
};

const v$ = useVuelidate(validationRules, state);

const isMergingContact = computed(() => uiFlags.value.isMerging);

const primaryContactList = computed(
  () =>
    searchResults.value?.map(item => ({
      value: item.id,
      label: `(ID: ${item.id}) ${item.name}`,
    })) ?? []
);

const onContactSearch = debounce(
  async query => {
    isSearching.value = true;
    searchResults.value = [];
    try {
      const {
        data: { payload },
      } = await ContactAPI.search(query);
      searchResults.value = payload.filter(
        contact => contact.id !== props.selectedContact.id
      );
      isSearching.value = false;
    } catch (error) {
      useAlert(t('CONTACTS_LAYOUT.SIDEBAR.MERGE.SEARCH_ERROR_MESSAGE'));
    } finally {
      isSearching.value = false;
    }
  },
  300,
  false
);

const resetState = () => {
  if (state.primaryContactId === null) {
    emit('resetTab');
  }
  state.primaryContactId = null;
  searchResults.value = [];
  isSearching.value = false;
};

const onMergeContacts = async () => {
  const isFormValid = await v$.value.$validate();
  if (!isFormValid) return;

  useTrack(CONTACTS_EVENTS.MERGED_CONTACTS);

  try {
    await store.dispatch('contacts/merge', {
      childId: props.selectedContact.id || currentParams.value.contactId,
      parentId: state.primaryContactId,
    });
    emit('goToContactsList');
    useAlert(t('CONTACTS_LAYOUT.SIDEBAR.MERGE.SUCCESS_MESSAGE'));
    resetState();
  } catch (error) {
    useAlert(t('CONTACTS_LAYOUT.SIDEBAR.MERGE.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <div class="flex flex-col gap-8 px-6 py-6">
    <div class="flex flex-col gap-2">
      <h4 class="text-base text-n-slate-12">
        {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.TITLE') }}
      </h4>
      <p class="text-sm text-n-slate-11">
        {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.DESCRIPTION') }}
      </p>
    </div>
    <ContactMergeForm
      v-model:primary-contact-id="state.primaryContactId"
      :selected-contact="selectedContact"
      :primary-contact-list="primaryContactList"
      :is-searching="isSearching"
      :has-error="!!v$.primaryContactId.$error"
      :error-message="
        v$.primaryContactId.$error
          ? t('CONTACTS_LAYOUT.SIDEBAR.MERGE.PRIMARY_REQUIRED_ERROR')
          : ''
      "
      @search="onContactSearch"
    />
    <div class="flex gap-2 justify-end">
      <Button variant="outline" @click="resetState">
        {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.BUTTONS.CANCEL') }}
      </Button>
      <Button :disabled="isMergingContact" @click="onMergeContacts">
        <Spinner v-if="isMergingContact" class="size-4 flex-shrink-0" />
        <template v-if="!isMergingContact">
          {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.BUTTONS.CONFIRM') }}
        </template>
      </Button>
    </div>
  </div>
</template>
