<script setup>
import { onMounted, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import ContactsDetailsLayout from 'dashboard/components-next/Contacts/ContactsDetailsLayout.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import ContactDetails from 'dashboard/components-next/Contacts/Pages/ContactDetails.vue';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from 'dashboard/components-next/ui/tabs';
import ContactNotes from 'dashboard/components-next/Contacts/ContactsSidebar/ContactNotes.vue';
import ContactHistory from 'dashboard/components-next/Contacts/ContactsSidebar/ContactHistory.vue';
import ContactMedia from 'dashboard/components-next/Contacts/ContactsSidebar/ContactMedia.vue';
import ContactMerge from 'dashboard/components-next/Contacts/ContactsSidebar/ContactMerge.vue';
import ContactCustomAttributes from 'dashboard/components-next/Contacts/ContactsSidebar/ContactCustomAttributes.vue';
import ClientInformationItem from 'dashboard/routes/dashboard/conversation/ClientInformationItem.vue';
import ContactClientBadges from 'dashboard/routes/dashboard/conversation/Client/ContactClientBadges.vue';

const store = useStore();
const { currentParams, visit } = useAppNavigation();

const contact = useMapGetter('contacts/getContactById');
const uiFlags = useMapGetter('contacts/getUIFlags');

const activeTab = ref('attributes');
const contactMergeRef = ref(null);

const isFetchingItem = computed(() => uiFlags.value.isFetchingItem);
const isMergingContact = computed(() => uiFlags.value.isMerging);
const isUpdatingContact = computed(() => uiFlags.value.isUpdating);

const selectedContact = computed(() =>
  contact.value(currentParams.value.contactId)
);

const showSpinner = computed(
  () => isFetchingItem.value || isMergingContact.value
);

const { t } = useI18n();

const goToContactsList = () => {
  if (window.history.state?.back || window.history.length > 1) {
    window.history.back();
  } else {
    // Dual-mode: Inertia SPA-visit / vue-router push to the contacts list. The account
    // id is injected from the current URL by useAppNavigation. (The prior `?page=1`
    // query is dropped — the list defaults to page 1.)
    visit({ name: 'contacts_dashboard_index' });
  }
};

const fetchActiveContact = async () => {
  const { contactId } = currentParams.value;
  if (contactId) {
    await store.dispatch('contacts/show', { id: contactId });
    await store.dispatch('contacts/fetchContactableInbox', contactId);
  }
};

const fetchContactNotes = () => {
  const { contactId } = currentParams.value;
  if (contactId) store.dispatch('contactNotes/get', { contactId });
};

const fetchContactConversations = () => {
  const { contactId } = currentParams.value;
  if (contactId) store.dispatch('contactConversations/get', contactId);
};

const fetchAttributes = () => {
  store.dispatch('attributes/get');
};

const toggleContactBlock = async isBlocked => {
  const ALERT_MESSAGES = {
    success: {
      block: t('CONTACTS_LAYOUT.HEADER.ACTIONS.BLOCK_SUCCESS_MESSAGE'),
      unblock: t('CONTACTS_LAYOUT.HEADER.ACTIONS.UNBLOCK_SUCCESS_MESSAGE'),
    },
    error: {
      block: t('CONTACTS_LAYOUT.HEADER.ACTIONS.BLOCK_ERROR_MESSAGE'),
      unblock: t('CONTACTS_LAYOUT.HEADER.ACTIONS.UNBLOCK_ERROR_MESSAGE'),
    },
  };

  try {
    await store.dispatch(`contacts/update`, {
      ...selectedContact.value,
      blocked: !isBlocked,
    });
    useAlert(
      isBlocked ? ALERT_MESSAGES.success.unblock : ALERT_MESSAGES.success.block
    );
  } catch (error) {
    useAlert(
      isBlocked ? ALERT_MESSAGES.error.unblock : ALERT_MESSAGES.error.block
    );
  }
};

onMounted(() => {
  fetchActiveContact();
  fetchContactNotes();
  fetchContactConversations();
  fetchAttributes();
});
</script>

<template>
  <div
    class="flex flex-col justify-between flex-1 h-full m-0 overflow-auto bg-n-surface-1"
  >
    <ContactsDetailsLayout
      :button-label="$t('CONTACTS_LAYOUT.HEADER.SEND_MESSAGE')"
      :selected-contact="selectedContact"
      is-detail-view
      :show-pagination-footer="false"
      :is-updating="isUpdatingContact"
      @go-to-contacts-list="goToContactsList"
      @toggle-block="toggleContactBlock"
    >
      <div
        v-if="showSpinner"
        class="flex items-center justify-center py-10 text-muted-foreground"
      >
        <Spinner class="size-6" />
      </div>

      <ContactDetails
        v-else-if="selectedContact"
        :selected-contact="selectedContact"
        @go-to-contacts-list="goToContactsList"
      />
      <template #sidebar>
        <Tabs v-model="activeTab" class="flex flex-col px-4 min-w-0">
          <TabsList class="w-full h-auto flex-wrap gap-1">
            <TabsTrigger value="client_information" class="flex-1 min-w-fit">
              {{ $t('CONTACTS_LAYOUT.SIDEBAR.TABS.CLIENT_INFORMATION') }}
            </TabsTrigger>

            <TabsTrigger value="attributes" class="flex-1 min-w-fit">
              {{ $t('CONTACTS_LAYOUT.SIDEBAR.TABS.ATTRIBUTES') }}
            </TabsTrigger>

            <TabsTrigger value="history" class="flex-1 min-w-fit">
              {{ $t('CONTACTS_LAYOUT.SIDEBAR.TABS.HISTORY') }}
            </TabsTrigger>

            <TabsTrigger value="notes" class="flex-1 min-w-fit">
              {{ $t('CONTACTS_LAYOUT.SIDEBAR.TABS.NOTES') }}
            </TabsTrigger>

            <TabsTrigger value="media" class="flex-1 min-w-fit">
              {{ $t('CONTACTS_LAYOUT.SIDEBAR.TABS.MEDIA') }}
            </TabsTrigger>

            <TabsTrigger value="merge" class="flex-1 min-w-fit">
              {{ $t('CONTACTS_LAYOUT.SIDEBAR.TABS.MERGE') }}
            </TabsTrigger>
          </TabsList>
          <div
            v-if="isFetchingItem"
            class="flex items-center justify-center py-10 text-n-slate-11"
          >
            <Spinner class="size-6" />
          </div>

          <template v-else>
            <TabsContent value="client_information" class="px-4">
              <div v-if="selectedContact" class="flex flex-col gap-3">
                <ContactClientBadges :contact="selectedContact" />
                <ClientInformationItem :contact="selectedContact" />
              </div>
            </TabsContent>

            <TabsContent value="attributes" class="mt-0">
              <ContactCustomAttributes :selected-contact="selectedContact" />
            </TabsContent>

            <TabsContent value="history" class="mt-0">
              <ContactHistory />
            </TabsContent>

            <TabsContent value="notes" class="mt-0">
              <ContactNotes />
            </TabsContent>

            <TabsContent value="media" class="mt-0">
              <ContactMedia />
            </TabsContent>

            <TabsContent value="merge" class="mt-0">
              <ContactMerge
                ref="contactMergeRef"
                :selected-contact="selectedContact"
                @go-to-contacts-list="goToContactsList"
                @reset-tab="activeTab = 'attributes'"
              />
            </TabsContent>
          </template>
        </Tabs>
      </template>
    </ContactsDetailsLayout>
  </div>
</template>
