<script setup>
import { computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  useMapGetter,
  useFunctionGetter,
  useStore,
} from 'dashboard/composables/store';
import { useAccount } from 'dashboard/composables/useAccount';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { FEATURE_FLAGS } from 'dashboard/featureFlags';

import { Dialog, DialogContent, DialogTitle } from 'next/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from 'next/ui/tabs';

import ContactConversations from './ContactConversations.vue';
import ConversationAction from './ConversationAction.vue';
import ConversationParticipant from './ConversationParticipant.vue';
import ContactInfo from './contact/ContactInfo.vue';
import ContactNotes from './contact/ContactNotes.vue';
import ConversationInfo from './ConversationInfo.vue';
import CustomAttributes from './customAttributes/CustomAttributes.vue';
import SharedFiles from './SharedFiles.vue';
import MacrosList from './Macros/List.vue';
import ShopifyOrdersList from 'dashboard/components/widgets/conversation/ShopifyOrdersList.vue';
import LinearIssuesList from 'dashboard/components/widgets/conversation/linear/IssuesList.vue';
import LinearSetupCTA from 'dashboard/components/widgets/conversation/linear/LinearSetupCTA.vue';
import ClientInformationItem from './ClientInformationItem.vue';

const props = defineProps({
  conversationId: {
    type: [Number, String],
    required: true,
  },
  inboxId: {
    type: Number,
    default: undefined,
  },
});

const { t } = useI18n();
const store = useStore();
const { uiSettings, updateUISettings, isOnExpandedLayout } = useUISettings();
const { isCloudFeatureEnabled } = useAccount();

const isOpen = computed(() => !!uiSettings.value.is_contact_sidebar_open);

const closeContactDialog = () => {
  updateUISettings({
    is_contact_sidebar_open: false,
    is_copilot_panel_open: false,
  });
};

const onOpenChange = value => {
  if (!value) closeContactDialog();
};

const shopifyIntegration = useFunctionGetter(
  'integrations/getIntegration',
  'shopify'
);
const isShopifyFeatureEnabled = computed(
  () => shopifyIntegration.value.enabled
);

const isLinearFeatureEnabled = computed(() =>
  isCloudFeatureEnabled(FEATURE_FLAGS.LINEAR)
);
const linearIntegration = useFunctionGetter(
  'integrations/getIntegration',
  'linear'
);
const isLinearClientIdConfigured = computed(
  () => !!linearIntegration.value?.id
);
const isLinearConnected = computed(
  () => linearIntegration.value?.enabled || false
);
const isMacrosEnabled = computed(() => isCloudFeatureEnabled('macros'));

const currentChat = useMapGetter('getSelectedChat');
const conversationId = computed(() => props.conversationId);
const conversationMetadataGetter = useMapGetter(
  'conversationMetadata/getConversationMetadata'
);
const currentConversationMetaData = computed(() =>
  conversationMetadataGetter.value(conversationId.value)
);
const conversationAdditionalAttributes = computed(
  () => currentConversationMetaData.value.additional_attributes || {}
);

const channelType = computed(() => currentChat.value.meta?.channel);

const contactGetter = useMapGetter('contacts/getContact');
const contactId = computed(() => currentChat.value.meta?.sender?.id);
const contact = computed(() => contactGetter.value(contactId.value));
const contactAdditionalAttributes = computed(
  () => contact.value.additional_attributes || {}
);

const appliedContactFilter = useMapGetter('getAppliedContactFilter');

const isListScopedToContact = computed(
  () =>
    !isOnExpandedLayout.value &&
    appliedContactFilter.value?.id === contactId.value
);

const availableTabs = [
  {
    key: 'service_information',
    label: 'Informações do atendimento',
  },
  {
    key: 'client_information',
    label: t('CONVERSATION_SIDEBAR.ACCORDION.CLIENT_INFORMATION'),
  },
  {
    key: 'contact_attributes',
    label: t('CONVERSATION_SIDEBAR.ACCORDION.CONTACT_ATTRIBUTES'),
  },
  {
    key: 'contact_notes',
    label: t('CONVERSATION_SIDEBAR.ACCORDION.CONTACT_NOTES'),
  },
  {
    key: 'shared_files',
    label: t('CONVERSATION_SIDEBAR.ACCORDION.SHARED_FILES'),
  },
];

const defaultTab = availableTabs[0].key;

const getContactDetails = () => {
  if (contactId.value) {
    store.dispatch('contacts/show', { id: contactId.value });
  }
};

watch(contactId, (newContactId, prevContactId) => {
  if (newContactId && newContactId !== prevContactId) {
    getContactDetails();
  }
});

onMounted(() => {
  getContactDetails();
  store.dispatch('attributes/get', 0);
  store.dispatch('integrations/get', 'linear');
});
</script>

<template>
  <Dialog :open="isOpen" @update:open="onOpenChange">
    <DialogContent
      class="flex flex-col sm:max-w-2xl lg:max-w-4xl max-h-[85vh] overflow-hidden"
    >
      <DialogTitle>
        {{ $t('CONVERSATION.SIDEBAR.CONTACT') }}
      </DialogTitle>

      <div class="flex flex-col flex-1 min-h-0 gap-4 pb-4 overflow-y-auto">
        <ContactInfo :contact="contact" :channel-type="channelType" />

        <Tabs :default-value="defaultTab" class="flex flex-col gap-4">
          <TabsList class="flex flex-wrap justify-center w-full h-auto gap-1">
            <TabsTrigger
              v-for="tab in availableTabs"
              :key="tab.key"
              :value="tab.key"
            >
              {{ tab.label }}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="client_information">
            <ClientInformationItem :contact="contact" />
          </TabsContent>

          <TabsContent
            value="service_information"
            class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start"
          >
            <section
              class="flex flex-col gap-2 pb-2 lg:col-span-2 border-b border-n-weak"
            >
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_SIDEBAR.ACCORDION.CONVERSATION_ACTIONS') }}
              </h3>
              <ConversationAction
                :conversation-id="conversationId"
                :inbox-id="inboxId"
              />
            </section>

            <section class="flex flex-col gap-2 border-b border-n-weak">
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_PARTICIPANTS.SIDEBAR_TITLE') }}
              </h3>
              <ConversationParticipant
                :conversation-id="conversationId"
                :inbox-id="inboxId"
              />
            </section>

            <section class="flex flex-col gap-2 border-b border-n-weak">
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_SIDEBAR.ACCORDION.CONVERSATION_INFO') }}
              </h3>
              <ConversationInfo
                :conversation-attributes="conversationAdditionalAttributes"
                :contact-attributes="contactAdditionalAttributes"
              />
            </section>

            <section
              v-if="contact.id && !isListScopedToContact"
              class="flex flex-col gap-2 border-b border-n-weak"
            >
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_SIDEBAR.ACCORDION.PREVIOUS_CONVERSATION') }}
              </h3>
              <ContactConversations
                :contact-id="contact.id"
                :conversation-id="conversationId"
              />
            </section>

            <section v-if="isMacrosEnabled" class="flex flex-col gap-2">
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_SIDEBAR.ACCORDION.MACROS') }}
              </h3>
              <MacrosList :conversation-id="conversationId" />
            </section>

            <section
              v-if="isLinearFeatureEnabled && isLinearClientIdConfigured"
              class="flex flex-col gap-2 border-b border-n-weak"
            >
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_SIDEBAR.ACCORDION.LINEAR_ISSUES') }}
              </h3>
              <LinearSetupCTA v-if="!isLinearConnected" />
              <LinearIssuesList v-else :conversation-id="conversationId" />
            </section>

            <section
              v-if="isShopifyFeatureEnabled"
              class="flex flex-col gap-2 border-b border-n-weak"
            >
              <h3 class="text-base font-medium">
                {{ $t('CONVERSATION_SIDEBAR.ACCORDION.SHOPIFY_ORDERS') }}
              </h3>
              <ShopifyOrdersList :contact-id="contactId" />
            </section>
          </TabsContent>

          <TabsContent value="contact_attributes">
            <CustomAttributes
              grid-layout
              attribute-type="contact_attribute"
              attribute-from="conversation_contact_panel"
              :contact-id="contact.id"
              :empty-state-message="
                $t('CONVERSATION_CUSTOM_ATTRIBUTES.NO_RECORDS_FOUND')
              "
            />
          </TabsContent>

          <TabsContent value="contact_notes">
            <ContactNotes :contact-id="contactId" />
          </TabsContent>

          <TabsContent value="shared_files">
            <SharedFiles />
          </TabsContent>
        </Tabs>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style lang="scss" scoped>
::v-deep {
  .contact--profile {
    @apply pb-3 border-b border-solid border-n-weak;
  }
}
</style>
